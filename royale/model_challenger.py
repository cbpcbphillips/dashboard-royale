"""Challenger model for the frozen-forecast test: LightGBM Poisson on TPAH (theo / available hour) per machine-day.

Same frozen split and data as royale/model.py: fit Jan 1 - Apr 30, 2025; predict May 1 - Jun 30 using only what was
known on Apr 30 (events count only if announced by Apr 30; no lag columns, nothing from May-June).

Features: the GLM's categoricals and numerics (M.CATS, M.NUMS), plus zone x weekday, game x weekday, event x zone,
days since install, and the machine's credibility-shrunk effect (M.machine_effects, from a GLM fit on the same
window the booster is fit on). Target = rate, sample_weight = available hours (Poisson with exposure).
Hyper-parameters are chosen on an inner split inside the training window only (fit Jan-Mar, score April).

Scored on exactly the gold.model_predictions May-June rows (target tpah) against the GLM (pred_model) and the
"same as before, by weekday" guess (royale/model_weekday.py), with a 2,000-rep machine bootstrap of the differences,
plus the leakage scramble test. Writes gold.model_challenger (summary) and gold.model_challenger_daily (whole-floor
daily series) to DuckDB and Databricks; logs MLflow run "tpah-lightgbm-challenger" in royale-tpah.
Registers royale.gold.tpah_lgbm only if the challenger clearly wins (both bootstrap ranges entirely below 0 vs the GLM
and vs the weekday guess, at day and two-month level).
Run: PYTHONIOENCODING=utf-8 uv run python -m royale.model_challenger [--no-databricks]
"""
from __future__ import annotations

import argparse
import itertools

import duckdb
import lightgbm as lgb
import mlflow
import mlflow.lightgbm
import numpy as np
import pandas as pd

from royale import dbx, model as M, targets

TARGET = "tpah"
COL = M.TARGETS[TARGET]
INNER_END = pd.Timestamp("2025-03-31")
EV_COLS = ["ev_major_weekend", "ev_convention", "ev_property_promo"]
LGB_CATS = M.CATS + ["zone_wd", "config_wd", "event_zone"]
LGB_NUMS = M.NUMS + ["days_since_install", "machine_effect"]
FEATURES = LGB_CATS + LGB_NUMS
GRID = {"num_leaves": [15, 31, 63], "min_child_samples": [20, 100], "learning_rate": [0.03]}
BASE_PARAMS = {"objective": "poisson", "n_estimators": 3000, "subsample": 0.8, "subsample_freq": 1,
               "colsample_bytree": 0.8, "reg_lambda": 1.0, "random_state": 7, "deterministic": True,
               "force_row_wise": True, "n_jobs": 4, "verbose": -1}


# ---------------------------------------------------------------- features
def load_install() -> pd.Series:
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    m = con.execute(f"SELECT machine_id, install_date FROM {t['bronze']}.machines").df()
    con.close()
    return pd.to_datetime(m.set_index("machine_id")["install_date"])


def add_features(d: pd.DataFrame, install: pd.Series) -> pd.DataFrame:
    d = d.copy()
    d["zone_wd"] = d["zone_id"].astype(str) + "|" + d["local_weekday"].astype(str)
    d["config_wd"] = d["config_id"].astype(str) + "|" + d["local_weekday"].astype(str)
    ev = np.where(d[EV_COLS].to_numpy() > 0, np.array(["W", "C", "P"]), "")
    ev_key = pd.Series(["".join(r) for r in ev], index=d.index)
    d["event_zone"] = np.where(ev_key == "", "none", d["zone_id"].astype(str) + "|" + ev_key)
    d["days_since_install"] = (d["gaming_date"] - d["machine_id"].map(install)).dt.days.astype(float)
    return d


def with_effect(fit: pd.DataFrame, rows: pd.DataFrame, alpha: float) -> pd.Series:
    """Shrunk machine effect learned on `fit` only (GLM alpha chosen on the same window); applied to `rows`."""
    glm = M.fit_glm(fit, TARGET, alpha)
    eff = M.machine_effects(fit, glm, TARGET).set_index("machine_id")["effect"]
    return rows["machine_id"].map(eff).fillna(1.0)


def to_lgb(df: pd.DataFrame, cats: dict) -> pd.DataFrame:
    X = df[FEATURES].copy()
    for c in LGB_CATS:
        X[c] = pd.Categorical(X[c].astype(str), categories=cats[c])
    return X


def fit_lgb(fit: pd.DataFrame, params: dict, n_estimators: int | None = None, val: pd.DataFrame | None = None):
    cats = {c: sorted(fit[c].astype(str).unique()) for c in LGB_CATS}
    p = {**BASE_PARAMS, **params}
    if n_estimators:
        p["n_estimators"] = n_estimators
    m = lgb.LGBMRegressor(**p)
    y = fit[COL] / fit["available_hours"]
    kw = {}
    if val is not None:
        kw = {"eval_X": to_lgb(val, cats), "eval_y": val[COL] / val["available_hours"],
              "eval_sample_weight": [val["available_hours"]], "callbacks": [lgb.early_stopping(100, verbose=False)]}
    m.fit(to_lgb(fit, cats), y, sample_weight=fit["available_hours"], **kw)
    return m, cats


def period_mae(df: pd.DataFrame, pred: np.ndarray) -> float:
    g = df.assign(p=pred * df["available_hours"]).groupby("machine_id")[[COL, "p", "available_hours"]].sum()
    return float(np.mean(np.abs(g[COL] / g.available_hours - g.p / g.available_hours)))


def challenger(days: pd.DataFrame, ev: pd.DataFrame, install: pd.Series) -> dict:
    """Full frozen pipeline: features -> inner tuning (Jan-Mar -> Apr) -> refit Jan-Apr -> predict May-Jun."""
    d = add_features(M.build_frame(days, ev, M.TRAIN_END), install)
    train, test = d[d.gaming_date <= M.TRAIN_END].copy(), d[d.gaming_date >= M.TEST_START].copy()

    # inner split: effect + booster fit on Jan-Mar only, scored on April
    inner_fit, inner_val = train[train.gaming_date <= INNER_END].copy(), train[train.gaming_date > INNER_END].copy()
    a_in = M.choose_alpha(train, TARGET)[0]   # same GLM alpha as the main model (chosen on Jan-Mar -> April)
    inner_fit["machine_effect"] = with_effect(inner_fit, inner_fit, a_in)
    inner_val["machine_effect"] = with_effect(inner_fit, inner_val, a_in)
    scores = []
    for nl, mcs, lr in itertools.product(GRID["num_leaves"], GRID["min_child_samples"], GRID["learning_rate"]):
        params = {"num_leaves": nl, "min_child_samples": mcs, "learning_rate": lr}
        m, cats = fit_lgb(inner_fit, params, val=inner_val)
        pv = m.predict(to_lgb(inner_val, cats))
        scores.append({**params, "best_iter": int(m.best_iteration_ or m.n_estimators),
                       "mae_day": float(np.mean(np.abs(pv - inner_val[COL] / inner_val["available_hours"]))),
                       "mae_period": period_mae(inner_val, pv)})
    scores = pd.DataFrame(scores).sort_values("mae_day").reset_index(drop=True)
    best = scores.iloc[0]
    params = {"num_leaves": int(best.num_leaves), "min_child_samples": int(best.min_child_samples),
              "learning_rate": float(best.learning_rate)}
    # refit on all of Jan-Apr; scale rounds by the extra month of data (4/3)
    n_iter = max(50, int(round(best.best_iter * 4 / 3)))
    train["machine_effect"] = with_effect(train, train, a_in)
    test["machine_effect"] = with_effect(train, test, a_in)
    model, cats = fit_lgb(train, params, n_estimators=n_iter)
    test["pred_challenger"] = model.predict(to_lgb(test, cats))
    return {"model": model, "cats": cats, "params": params, "n_iter": n_iter, "glm_alpha": a_in,
            "tuning": scores, "test": test, "train_rows": len(train)}


# ---------------------------------------------------------------- weekday guess (as royale/model_weekday.py)
def weekday_guess(days: pd.DataFrame, test: pd.DataFrame) -> pd.Series:
    train = days[days.gaming_date <= M.TRAIN_END]
    mach = train.groupby("machine_id")[[COL, "available_hours"]].sum()
    mach_rate = mach[COL] / mach["available_hours"]
    floor_rate = train[COL].sum() / train["available_hours"].sum()
    wd = train.groupby("local_weekday")[[COL, "available_hours"]].sum()
    wd_factor = wd[COL] / wd["available_hours"] / floor_rate
    p = test["machine_id"].map(mach_rate).fillna(test["pred_zone_game"]) * test["local_weekday"].map(wd_factor)
    assert p.notna().all()
    return p


def boot(test: pd.DataFrame, a: str, b: str, reps: int = 2000, seed: int = 7) -> dict:
    """Machine bootstrap of MAE(a) - MAE(b), day level (pooled) and two-month level (ratio of sums per machine)."""
    h = test["available_hours"]
    per = test.assign(**{f"{k}_h": test[k] * h for k in (a, b, "actual")}).groupby("machine_id").sum(numeric_only=True)
    ids = per.index.to_numpy()
    rate = {k: per[f"{k}_h"] / per["available_hours"] for k in (a, b, "actual")}
    pa, pb = (np.abs(rate[k] - rate["actual"]).to_numpy() for k in (a, b))
    e = test.assign(ea=np.abs(test[a] - test.actual), eb=np.abs(test[b] - test.actual)).groupby("machine_id")
    sa, sb, n = (e["ea"].sum().reindex(ids).to_numpy(), e["eb"].sum().reindex(ids).to_numpy(),
                 e["ea"].count().reindex(ids).to_numpy())
    rng = np.random.default_rng(seed)
    bd, bp = [], []
    for _ in range(reps):
        i = rng.integers(0, len(ids), len(ids))
        bd.append((sa[i].sum() - sb[i].sum()) / n[i].sum())
        bp.append(pa[i].mean() - pb[i].mean())
    return {"day": float((sa.sum() - sb.sum()) / n.sum()), "day_lo": float(np.percentile(bd, 2.5)),
            "day_hi": float(np.percentile(bd, 97.5)), "period": float(pa.mean() - pb.mean()),
            "period_lo": float(np.percentile(bp, 2.5)), "period_hi": float(np.percentile(bp, 97.5)),
            "mae_day_a": float(sa.sum() / n.sum()), "mae_period_a": float(pa.mean()),
            "mae_day_b": float(sb.sum() / n.sum()), "mae_period_b": float(pb.mean()), "machines": len(ids)}


def leakage_test(days: pd.DataFrame, ev: pd.DataFrame, install: pd.Series, reference: pd.DataFrame) -> float:
    """Scramble every May-Jun outcome (as M.leakage_test); challenger May-Jun predictions must not change."""
    rng = np.random.default_rng(0)
    scr = days.copy()
    mask = scr["gaming_date"] >= M.TEST_START
    for c in ("theo_usd", "coin_in_usd", "occupied_hours"):
        scr.loc[mask, c] = rng.permutation(scr.loc[mask, c].to_numpy()) * rng.uniform(0.5, 1.5, mask.sum())
    t = challenger(scr, ev, install)["test"][["machine_id", "gaming_date", "pred_challenger"]]
    j = reference.merge(t, on=["machine_id", "gaming_date"], suffixes=("", "_scr"))
    assert len(j) == len(reference)
    return float(np.max(np.abs(j.pred_challenger - j.pred_challenger_scr)))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    ap.add_argument("--skip-leakage", action="store_true")
    args = ap.parse_args()
    t = targets.load()
    g = t["gold"]

    days, ev = M.load_days()
    install = load_install()
    run = challenger(days, ev, install)
    print("inner tuning (fit Jan-Mar, score April):\n", run["tuning"].round(4).to_string(index=False))

    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    test = con.execute(f"SELECT * FROM {g}.model_predictions WHERE target = 'tpah'").df()
    con.close()
    test["gaming_date"] = pd.to_datetime(test["gaming_date"])
    n0 = len(test)
    test = test.merge(days[["machine_id", "gaming_date", "local_weekday"]], on=["machine_id", "gaming_date"], how="left")
    test = test.merge(run["test"][["machine_id", "gaming_date", "pred_challenger"]], on=["machine_id", "gaming_date"], how="left")
    assert len(test) == n0 and test["pred_challenger"].notna().all(), "challenger rows must match gold.model_predictions"
    test["pred_weekday"] = weekday_guess(days, test)

    vs_glm, vs_wd = boot(test, "pred_challenger", "pred_model"), boot(test, "pred_challenger", "pred_weekday")
    wins = all(b[k] < 0 for b in (vs_glm, vs_wd) for k in ("day_hi", "period_hi"))
    leak = np.nan if args.skip_leakage else leakage_test(days, ev, install, run["test"][["machine_id", "gaming_date", "pred_challenger"]])
    print(f"leakage scramble: max |change| in May-Jun predictions = {leak}")

    summary = pd.DataFrame([{
        "target": TARGET, "method": "pred_challenger", "label": "LightGBM Poisson challenger",
        "mae_machine_day_challenger": vs_glm["mae_day_a"], "mae_machine_period_challenger": vs_glm["mae_period_a"],
        "mae_machine_day_model": vs_glm["mae_day_b"], "mae_machine_period_model": vs_glm["mae_period_b"],
        "mae_machine_day_weekday": vs_wd["mae_day_b"], "mae_machine_period_weekday": vs_wd["mae_period_b"],
        "day_diff_vs_model": vs_glm["day"], "day_diff_vs_model_lo": vs_glm["day_lo"], "day_diff_vs_model_hi": vs_glm["day_hi"],
        "period_diff_vs_model": vs_glm["period"], "period_diff_vs_model_lo": vs_glm["period_lo"], "period_diff_vs_model_hi": vs_glm["period_hi"],
        "day_diff_vs_weekday": vs_wd["day"], "day_diff_vs_weekday_lo": vs_wd["day_lo"], "day_diff_vs_weekday_hi": vs_wd["day_hi"],
        "period_diff_vs_weekday": vs_wd["period"], "period_diff_vs_weekday_lo": vs_wd["period_lo"], "period_diff_vs_weekday_hi": vs_wd["period_hi"],
        "leakage_max_abs_change": leak, "clearly_wins": bool(wins),
        "num_leaves": run["params"]["num_leaves"], "min_child_samples": run["params"]["min_child_samples"],
        "learning_rate": run["params"]["learning_rate"], "n_estimators": run["n_iter"],
        "train_rows": run["train_rows"], "machines": vs_glm["machines"], "machine_days": len(test),
    }])
    h = test["available_hours"]
    daily = (test.assign(**{f"{k}_h": test[k] * h for k in ("actual", "pred_model", "pred_weekday", "pred_challenger")})
             .groupby(test.gaming_date.dt.date).sum(numeric_only=True))
    daily = pd.DataFrame({k.replace("pred_", ""): daily[f"{k}_h"] / daily["available_hours"]
                          for k in ("actual", "pred_model", "pred_weekday", "pred_challenger")}).rename_axis("gaming_date").reset_index()

    run_id = None
    if not args.no_databricks:
        user = dbx.client().current_user.me().user_name
        mlflow.set_tracking_uri(f"databricks://{dbx.PROFILE}")
        mlflow.set_experiment(f"/Users/{user}/royale-tpah")
        with mlflow.start_run(run_name="tpah-lightgbm-challenger") as r:
            mlflow.set_tags({"target": TARGET, "method": "LightGBM Poisson challenger", "purpose": "challenger vs GLM and weekday guess",
                             "clearly_wins": str(wins)})
            mlflow.log_params({"train_window": "2025-01-01..2025-04-30", "test_window": "2025-05-01..2025-06-30",
                               "tuning_split": "fit Jan-Mar, score April", "features": ",".join(FEATURES),
                               **run["params"], "n_estimators": run["n_iter"], "glm_alpha_for_effect": run["glm_alpha"]})
            mlflow.log_metrics({k: float(v) for k, v in summary.iloc[0].items()
                                if isinstance(v, (int, float, np.floating)) and not isinstance(v, bool) and np.isfinite(v)})
            mlflow.log_text(run["tuning"].to_csv(index=False), "inner_tuning.csv")
            if wins:
                mlflow.lightgbm.log_model(run["model"], name="tpah_lgbm",
                                          input_example=to_lgb(run["test"].head(5), run["cats"]),
                                          registered_model_name=f"{t['catalog']}.{g}.tpah_lgbm")
            run_id = r.info.run_id
    summary["mlflow_run_id"] = run_id

    con = duckdb.connect(str(targets.LOCAL_DB))
    for name, df in {"model_challenger": summary, "model_challenger_daily": daily}.items():
        con.register("df_tmp", df)
        con.execute(f"CREATE OR REPLACE TABLE {g}.{name} AS SELECT * FROM df_tmp")
        con.unregister("df_tmp")
    con.close()
    if not args.no_databricks:
        gold = targets.prefixes("databricks")["gold"]
        dbx.write_table(summary, f"{gold}.model_challenger", targets.volume_root())
        dbx.write_table(daily, f"{gold}.model_challenger_daily", targets.volume_root())
    pd.set_option("display.width", 200)
    print(summary.T.to_string())


if __name__ == "__main__":
    main()

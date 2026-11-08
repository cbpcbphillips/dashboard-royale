"""Run the Stage B5 model end to end and publish results.

1. Frozen forecast (Apr 30) for TPAH and CPAH vs both baselines; metrics; leakage test.
2. Machine effects (frozen + July refit on Jan-Jun).
3. Move what-ifs (D-031): same game in banks of other zones where that game already runs.
4. Natural-experiment check of the location effect on the two February moves.
5. MLflow runs in Databricks; July TPAH model registered in Unity Catalog.
6. Gold tables on DuckDB and Databricks.
Run: uv run python -m royale.model_run
"""
from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import duckdb
import mlflow
import numpy as np
import pandas as pd
import plotly.graph_objects as go

from royale import dbx, model as M, targets

MOVED_OR_NEW = ["M-1126", "M-1299", "M-5076"]   # moved inside May-Jun, or no Jan-Apr history
FEB_MOVES = {"M-1152": "2025-02-04", "M-1113": "2025-02-18"}
JULY_FIT_END = pd.Timestamp("2025-06-30")
MOVE_LEAD_DAYS, MOVE_COST, MOVE_DOWNTIME_H, HORIZON = 2, 1800.0, 3.0, 30


def manifest_sha() -> str:
    return hashlib.sha256(targets.MANIFEST.read_bytes()).hexdigest()[:16]


# ------------------------------------------------------------------ what-ifs
def july_refit(days, ev, target, alpha):
    d = M.build_frame(days, ev, JULY_FIT_END)
    glm = M.fit_glm(d, target, alpha)
    eff = M.machine_effects(d, glm, target)
    return d, glm, eff


def move_whatifs(d: pd.DataFrame, glm, eff: pd.DataFrame) -> pd.DataFrame:
    """For each machine on the floor on Jun 30: predicted TPAH of the same machine in each bank of
    another zone where its game already runs, on the machine's own June calendar mix."""
    june = d[d.gaming_date >= pd.Timestamp("2025-06-01")]
    on_floor = set(d.loc[d.gaming_date == JULY_FIT_END, "machine_id"])
    game_banks = d.groupby("config_id").apply(lambda g: g[["zone_id", "bank_id"]].drop_duplicates(), include_groups=False)
    effect = eff.set_index("machine_id")["effect"]
    rows = []
    for mid, g in june[june.machine_id.isin(on_floor)].groupby("machine_id"):
        cur_zone, cur_bank, cfg = g.zone_id.iloc[-1], g.bank_id.iloc[-1], g.config_id.iloc[-1]
        g = g.assign(zone_id=cur_zone, bank_id=cur_bank)
        w = g.available_hours.to_numpy()
        mult = effect.get(mid, 1.0)
        cur = np.average(glm.predict(g[M.CATS + M.NUMS]), weights=w) * mult
        hours_per_day = g.available_hours.mean()
        for zone, banks in game_banks.loc[cfg].groupby("zone_id"):
            if zone == cur_zone:
                continue
            preds = [np.average(glm.predict(g.assign(zone_id=zone, bank_id=b)[M.CATS + M.NUMS]), weights=w) * mult
                     for b in banks.bank_id]
            dest = float(np.mean(preds))
            gain = (dest - cur) * hours_per_day * (HORIZON - MOVE_LEAD_DAYS) - MOVE_DOWNTIME_H * cur - MOVE_COST
            rows.append({"machine_id": mid, "config_id": cfg, "current_zone": cur_zone, "current_bank": cur_bank,
                         "dest_zone": zone, "dest_banks": ",".join(sorted(banks.bank_id)),
                         "current_tpah": cur, "dest_tpah": dest, "ratio": dest / cur,
                         "hours_per_day": hours_per_day, "net_gain_30d": gain})
    out = pd.DataFrame(rows)
    out["best_for_machine"] = out.groupby("machine_id")["net_gain_30d"].rank(ascending=False, method="first") == 1
    return out


def feb_move_check(days, ev, target, alpha) -> pd.DataFrame:
    """Fit Jan-Apr WITHOUT the two machines that moved in February, then predict their earning rate
    before and after the move; compare predicted vs actual change."""
    d = M.build_frame(days, ev, M.TRAIN_END)
    tr = d[d.gaming_date <= M.TRAIN_END]
    glm = M.fit_glm(tr[~tr.machine_id.isin(FEB_MOVES)], target, alpha)
    rows = []
    for mid, when in FEB_MOVES.items():
        g = tr[tr.machine_id == mid].copy()
        g["pred"] = glm.predict(g[M.CATS + M.NUMS])
        g["actual"] = g[M.TARGETS[target]] / g.available_hours
        pre, post = g[g.gaming_date < pd.Timestamp(when)], g[g.gaming_date >= pd.Timestamp(when)]
        r = lambda x, c: np.average(x[c], weights=x.available_hours)
        rows.append({"machine_id": mid, "move_date": when, "from_zone": pre.zone_id.iloc[-1], "to_zone": post.zone_id.iloc[0],
                     "from_bank": pre.bank_id.iloc[-1], "to_bank": post.bank_id.iloc[0],
                     "days_before": len(pre), "days_after": len(post),
                     "actual_before": r(pre, "actual"), "actual_after": r(post, "actual"),
                     "pred_before": r(pre, "pred"), "pred_after": r(post, "pred")})
    out = pd.DataFrame(rows)
    out["actual_change"] = out.actual_after / out.actual_before
    out["predicted_change"] = out.pred_after / out.pred_before
    return out


# ------------------------------------------------------------------ MLflow
def log_runs(runs: dict, mets: pd.DataFrame, leak: dict, july: dict, moves: pd.DataFrame, check: pd.DataFrame):
    user = dbx.client().current_user.me().user_name
    mlflow.set_tracking_uri(f"databricks://{dbx.PROFILE}")
    mlflow.set_experiment(f"/Users/{user}/royale-tpah")
    common = {"train_window": "2025-01-01..2025-04-30", "test_window": "2025-05-01..2025-06-30",
              "framing": "frozen forecast at 2025-04-30", "data_manifest_sha256_16": manifest_sha()}
    ids = {}
    for target, run in runs.items():
        for method, label in M.METHODS.items():
            row = mets[(mets.target == target) & (mets.method == method)].iloc[0]
            with mlflow.start_run(run_name=f"{target}-{method.removeprefix('pred_')}") as r:
                mlflow.set_tags({"target": target, "method": label, "stage": "B5"})
                mlflow.log_params({**common, "target": target, "method": label})
                if method in ("pred_model", "pred_glm_only"):
                    mlflow.log_params({"alpha": run["alpha"], "features_categorical": ",".join(M.CATS),
                                       "features_numeric": ",".join(M.NUMS),
                                       "alpha_inner_scores": json.dumps({str(k): round(v, 4) for k, v in run["alpha_scores"].items()})})
                    mlflow.log_metric("leakage_test_max_abs_change", leak[target])
                mlflow.log_metrics({k: float(row[k]) for k in row.index if k.startswith(("mae", "bias", "mean_actual"))
                                    and pd.notna(row[k])})
                if method == "pred_model":
                    per = M.period_table(run["test"])
                    fig = go.Figure()
                    for m2, name in (("pred_persistence", "Persistence"), ("pred_zone_game", "Zone x game"), ("pred_model", "GLM + machine effect")):
                        fig.add_scatter(x=per[m2], y=per["actual"], mode="markers", name=name, text=per.index)
                    lim = [per["actual"].min() * 0.9, per["actual"].max() * 1.1]
                    fig.add_scatter(x=lim, y=lim, mode="lines", name="perfect", line={"dash": "dash"})
                    fig.update_layout(title=f"{target.upper()} May-Jun per machine: predicted vs actual",
                                      xaxis_title="predicted $/available hour", yaxis_title="actual $/available hour")
                    mlflow.log_figure(fig, f"pred_vs_actual_{target}.html")
                    names = run["glm"].named_steps["pre"].get_feature_names_out()
                    coef = pd.DataFrame({"feature": names, "coef": run["glm"].named_steps["glm"].coef_})
                    with tempfile.TemporaryDirectory() as tmp:
                        coef.to_csv(Path(tmp) / f"coefficients_{target}.csv", index=False)
                        run["effects"].to_csv(Path(tmp) / f"machine_effects_{target}.csv", index=False)
                        mlflow.log_artifacts(tmp)
                ids[(target, method)] = r.info.run_id
    with mlflow.start_run(run_name="tpah-july-refit") as r:
        mlflow.set_tags({"target": "tpah", "stage": "B5", "purpose": "July decisions (refit on Jan-Jun)"})
        mlflow.log_params({"fit_window": "2025-01-01..2025-06-30", "alpha": july["alpha"],
                           "data_manifest_sha256_16": manifest_sha()})
        with tempfile.TemporaryDirectory() as tmp:
            moves.to_csv(Path(tmp) / "move_whatifs.csv", index=False)
            check.to_csv(Path(tmp) / "feb_move_check.csv", index=False)
            mlflow.log_artifacts(tmp)
        registered = None
        try:
            from mlflow.models import infer_signature
            X = july["frame"][M.CATS + M.NUMS].head(200)
            mlflow.set_registry_uri(f"databricks-uc://{dbx.PROFILE}")
            info = mlflow.sklearn.log_model(july["glm"], name="tpah_glm", input_example=X.head(5),
                                            signature=infer_signature(X, july["glm"].predict(X)),
                                            registered_model_name=f"{targets.load()['catalog']}.{targets.load()['gold']}.tpah_glm")
            registered = info.registered_model_version
        except Exception as exc:  # registry is a nice-to-have; record why if it fails
            mlflow.set_tag("uc_registration_error", str(exc)[:500])
            print("UC registration failed:", str(exc)[:300])
        ids[("tpah", "july")] = r.info.run_id
    return ids, registered


# ------------------------------------------------------------------ main
def main():
    days, ev = M.load_days()
    runs, mets, leak = {}, [], {}
    for target in M.TARGETS:
        run = M.frozen_run(days, ev, target)
        runs[target] = run
        mets.append(M.metrics(run, MOVED_OR_NEW))
        leak[target] = M.leakage_test(days, ev, target, run["test"]["pred_model"])
        print(f"{target}: alpha {run['alpha']}, leakage max change {leak[target]:.2e}")
    mets = pd.concat(mets, ignore_index=True)

    alpha_t = runs["tpah"]["alpha"]
    frame, glm_j, eff_j = july_refit(days, ev, "tpah", alpha_t)
    moves = move_whatifs(frame, glm_j, eff_j)
    check = feb_move_check(days, ev, "tpah", alpha_t)

    ids, registered = log_runs(runs, mets, leak, {"alpha": alpha_t, "glm": glm_j, "frame": frame}, moves, check)
    mets["mlflow_run_id"] = [ids.get((t, m)) for t, m in zip(mets.target, mets.method)]
    mets["leakage_test_max_abs_change"] = mets.target.map(leak)

    preds = []
    for target, run in runs.items():
        t = run["test"][["machine_id", "gaming_date", "zone_id", "bank_id", "config_id", "available_hours",
                         "actual", *M.METHODS]].copy()
        t.insert(0, "target", target)
        preds.append(t)
    preds = pd.concat(preds, ignore_index=True)
    preds["gaming_date"] = preds["gaming_date"].dt.date

    effects = []
    for label, e in (("frozen_jan_apr_tpah", runs["tpah"]["effects"]), ("frozen_jan_apr_cpah", runs["cpah"]["effects"]),
                     ("july_refit_jan_jun_tpah", eff_j)):
        effects.append(e.assign(fit=label))
    effects = pd.concat(effects, ignore_index=True)

    tables = {"model_metrics": mets, "model_predictions": preds, "machine_effect": effects,
              "move_whatif": moves, "model_move_check": check}
    g = targets.load()["gold"]
    con = duckdb.connect(str(targets.LOCAL_DB))
    for name, df in tables.items():
        con.register("df_tmp", df)
        con.execute(f"CREATE OR REPLACE TABLE {g}.{name} AS SELECT * FROM df_tmp")
        con.unregister("df_tmp")
    con.close()
    for name, df in tables.items():
        dbx.write_table(df, f"{targets.prefixes('databricks')['gold']}.{name}", targets.volume_root())
    print("tables written:", ", ".join(tables), "| UC model version:", registered)

    pd.set_option("display.width", 220)
    print(mets[["target", "method", "mae_machine_period", "bias_machine_period", "mae_machine_day",
                "mae_moved_or_new", "mae_diff_vs_pred_persistence", "mae_diff_vs_pred_persistence_lo",
                "mae_diff_vs_pred_persistence_hi", "mae_diff_vs_pred_zone_game", "mae_diff_vs_pred_zone_game_lo",
                "mae_diff_vs_pred_zone_game_hi"]].round(3).to_string(index=False))
    print(check.round(3).to_string(index=False))
    best = moves[moves.best_for_machine].sort_values("net_gain_30d", ascending=False)
    print("positive best moves:", int((best.net_gain_30d > 0).sum()), "of", len(best))
    print(best.head(10)[["machine_id", "config_id", "current_zone", "dest_zone", "current_tpah", "dest_tpah", "net_gain_30d"]].round(2).to_string(index=False))
    print(eff_j.describe()[["raw_ratio", "effect", "credibility"]].round(4).to_string())


if __name__ == "__main__":
    main()

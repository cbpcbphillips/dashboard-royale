"""Stage B5 model: expected earning rate per machine-day (D-002, D-003, D-004, D-005, D-015, D-030).

Frozen forecast: fit on Jan 1 - Apr 30, 2025; predict every May 1 - Jun 30 machine-day using only
information known on Apr 30. Targets: TPAH (theo / available hour) and CPAH (coin-in / available hour).

Step 1  Exposure-weighted Poisson GLM (log link; rate target with sample_weight = available hours,
        equivalent to a count model with an exposure offset) on zone, bank (= neighbour effect, D-032),
        game, maker, lease class, calendar, pre-announced event types and the Back Forty walkway closure.
Step 2  Machine effect = actual / GLM-expected on training rows, credibility-shrunk toward 1.0
        (more data -> less shrinkage), with a 95% interval.
Regularization strength is chosen on an inner split INSIDE the training window (Jan-Mar -> April).
"""
from __future__ import annotations

import datetime as dt

import duckdb
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from royale import targets

TRAIN_END = pd.Timestamp("2025-04-30")      # frozen-forecast date
TEST_START = pd.Timestamp("2025-05-01")
TARGETS = {"tpah": "theo_usd", "cpah": "coin_in_usd"}
CATS = ["zone_id", "bank_id", "config_id", "manufacturer", "lease_class", "local_weekday"]
# D-032: the bank terms ARE the neighbour (bank-mates) effect; a separate bank-mates occupancy term
# collided with them (negative coefficient), so it is computed for the scorecard but not fitted.
NUMS = ["is_holiday", "ev_major_weekend", "ev_convention", "ev_property_promo", "b40_walkway_closed"]
EVENT_GROUP = {"sports_viewing": "ev_major_weekend", "festival": "ev_major_weekend",
               "convention": "ev_convention", "property_promotion": "ev_property_promo"}
ALPHAS = [1e-5, 1e-4, 1e-3, 1e-2, 3e-2, 1e-1, 3e-1]


# ---------------------------------------------------------------- data
def load_days() -> pd.DataFrame:
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    d = con.execute(f"""
        SELECT m.machine_id, m.gaming_date, m.zone_id, m.bank_id, m.config_id, m.manufacturer, m.lease_class,
               m.available_hours, m.occupied_hours, m.theo_usd, m.coin_in_usd, m.configured_rtp,
               c.local_weekday, c.federal_holiday, z.walkway_closed
        FROM {t['gold']}.machine_day m
        JOIN {t['bronze']}.calendar_day c ON c.gaming_date = m.gaming_date
        JOIN {t['gold']}.zone_day z ON z.zone_id = m.zone_id AND z.gaming_date = m.gaming_date
        WHERE m.available_hours > 0""").df()
    ev = con.execute(f"SELECT event_type, start_date, end_date, announced_date FROM {t['bronze']}.events").df()
    con.close()
    d["gaming_date"] = pd.to_datetime(d["gaming_date"])
    d["is_holiday"] = d["federal_holiday"].notna() & (d["federal_holiday"].astype(str) != "")
    d["is_holiday"] = d["is_holiday"].astype(float)
    d["b40_walkway_closed"] = ((d["walkway_closed"] == 1) & (d["zone_id"] == "Z-B40")).astype(float)
    return d, ev


def add_event_flags(d: pd.DataFrame, ev: pd.DataFrame, known_by: pd.Timestamp) -> pd.DataFrame:
    """Event-type flags, using only events announced on or before `known_by`."""
    d = d.copy()
    for col in set(EVENT_GROUP.values()):
        d[col] = 0.0
    for r in ev.itertuples():
        if pd.Timestamp(r.announced_date) > known_by:
            continue
        on = d["gaming_date"].between(pd.Timestamp(r.start_date), pd.Timestamp(r.end_date))
        d.loc[on, EVENT_GROUP[r.event_type]] = 1.0
    return d


def add_bank_mates(d: pd.DataFrame, fit_rows: pd.Series) -> pd.DataFrame:
    """Bank-mates' occupancy in the fitting window, excluding the machine itself (D-013)."""
    d = d.copy()
    f = d[fit_rows]
    bank = f.groupby("bank_id")[["occupied_hours", "available_hours"]].sum()
    own = f.groupby(["machine_id", "bank_id"])[["occupied_hours", "available_hours"]].sum()
    occ = {}
    for (m, b), r in own.iterrows():
        occ[(m, b)] = (bank.loc[b, "occupied_hours"] - r.occupied_hours) / (bank.loc[b, "available_hours"] - r.available_hours)
    bank_occ = (bank["occupied_hours"] / bank["available_hours"]).to_dict()
    vals = [occ.get((m, b), bank_occ.get(b, np.nan)) for m, b in zip(d["machine_id"], d["bank_id"])]
    d["log_bank_mates_occ"] = np.log(np.clip(np.array(vals, dtype=float), 1e-3, None))
    d["log_bank_mates_occ"] = d["log_bank_mates_occ"].fillna(d["log_bank_mates_occ"].median())
    return d


# ---------------------------------------------------------------- model
def make_glm(alpha: float) -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATS),
        ("num", StandardScaler(), NUMS),
    ])
    return Pipeline([("pre", pre), ("glm", PoissonRegressor(alpha=alpha, max_iter=1000))])


def fit_glm(df: pd.DataFrame, target: str, alpha: float) -> Pipeline:
    y = df[TARGETS[target]] / df["available_hours"]
    return make_glm(alpha).fit(df[CATS + NUMS], y, glm__sample_weight=df["available_hours"])


def choose_alpha(train: pd.DataFrame, target: str) -> tuple[float, dict]:
    """Inner time split inside the training window only: fit Jan-Mar, score April (machine-period MAE)."""
    inner_fit = train[train["gaming_date"] < pd.Timestamp("2025-04-01")]
    inner_val = train[train["gaming_date"] >= pd.Timestamp("2025-04-01")]
    scores = {}
    for a in ALPHAS:
        m = fit_glm(inner_fit, target, a)
        p = inner_val.assign(pred=m.predict(inner_val[CATS + NUMS]) * inner_val["available_hours"])
        g = p.groupby("machine_id").agg(a_=(TARGETS[target], "sum"), p_=("pred", "sum"), h=("available_hours", "sum"))
        scores[a] = float(np.mean(np.abs(g.a_ / g.h - g.p_ / g.h)))
    return min(scores, key=scores.get), scores


def machine_effects(train: pd.DataFrame, glm: Pipeline, target: str) -> pd.DataFrame:
    """Credibility-shrunk machine effect (D-030).

    r_m = actual / expected on training rows; within-machine noise w_m from weekly blocks;
    between-machine spread tau^2 by method of moments; Z_m = tau^2 / (tau^2 + w_m);
    effect = 1 + Z_m (r_m - 1); 95% interval from the posterior variance Z_m * w_m.
    """
    p = train.assign(expected=glm.predict(train[CATS + NUMS]) * train["available_hours"],
                     week=train["gaming_date"].dt.to_period("W"))
    wk = p.groupby(["machine_id", "week"]).agg(a=(TARGETS[target], "sum"), e=("expected", "sum")).reset_index()
    rows = []
    for m, g in wk.groupby("machine_id"):
        r = g.a.sum() / g.e.sum()
        n = len(g)
        w = (g.a / g.e).var(ddof=1) / n if n > 1 else np.nan
        rows.append((m, r, w, n, g.e.sum()))
    e = pd.DataFrame(rows, columns=["machine_id", "raw_ratio", "within_var", "weeks", "expected_train"])
    e["within_var"] = e["within_var"].fillna(e["within_var"].max())
    tau2 = max(float(e["raw_ratio"].var(ddof=1) - e["within_var"].mean()), 1e-6)
    e["credibility"] = tau2 / (tau2 + e["within_var"])
    e["effect"] = 1 + e["credibility"] * (e["raw_ratio"] - 1)
    sd = np.sqrt(e["credibility"] * e["within_var"])
    e["effect_lo"], e["effect_hi"] = e["effect"] - 1.96 * sd, e["effect"] + 1.96 * sd
    e["tau2"] = tau2
    return e


def predict(df: pd.DataFrame, glm: Pipeline, eff: pd.DataFrame) -> np.ndarray:
    base = glm.predict(df[CATS + NUMS])
    mult = df["machine_id"].map(eff.set_index("machine_id")["effect"]).fillna(1.0).to_numpy()
    return base * mult


# ---------------------------------------------------------------- baselines (D-005)
def baselines(train: pd.DataFrame, test: pd.DataFrame, target: str) -> pd.DataFrame:
    col = TARGETS[target]
    zg = train.groupby(["zone_id", "config_id"])[[col, "available_hours"]].sum()
    zg = (zg[col] / zg["available_hours"]).rename("zg")
    cfg = train.groupby("config_id")[[col, "available_hours"]].sum()
    cfg = (cfg[col] / cfg["available_hours"]).rename("cfg")
    floor = train[col].sum() / train["available_hours"].sum()
    mach = train.groupby("machine_id")[[col, "available_hours"]].sum()
    mach = (mach[col] / mach["available_hours"]).rename("mach")
    out = test[["machine_id", "zone_id", "config_id"]].copy()
    out = out.join(zg, on=["zone_id", "config_id"]).join(cfg, on="config_id").join(mach, on="machine_id")
    out["pred_zone_game"] = out["zg"].fillna(out["cfg"]).fillna(floor)
    out["pred_persistence"] = out["mach"].fillna(out["pred_zone_game"])
    return out[["pred_zone_game", "pred_persistence"]]


# ---------------------------------------------------------------- full frozen run
def build_frame(days: pd.DataFrame, ev: pd.DataFrame, fit_end: pd.Timestamp) -> pd.DataFrame:
    d = add_event_flags(days, ev, known_by=fit_end)
    return add_bank_mates(d, d["gaming_date"] <= fit_end)


def frozen_run(days: pd.DataFrame, ev: pd.DataFrame, target: str) -> dict:
    d = build_frame(days, ev, TRAIN_END)
    train, test = d[d.gaming_date <= TRAIN_END].copy(), d[d.gaming_date >= TEST_START].copy()
    alpha, alpha_scores = choose_alpha(train, target)
    glm = fit_glm(train, target, alpha)
    eff = machine_effects(train, glm, target)
    test["pred_model"] = predict(test, glm, eff)
    test["pred_glm_only"] = glm.predict(test[CATS + NUMS])
    test = pd.concat([test, baselines(train, test, target).set_index(test.index)], axis=1)
    test["actual"] = test[TARGETS[target]] / test["available_hours"]
    return {"target": target, "alpha": alpha, "alpha_scores": alpha_scores, "glm": glm, "effects": eff,
            "test": test, "train_rows": len(train), "test_rows": len(test)}


METHODS = {"pred_model": "GLM + machine effect", "pred_glm_only": "GLM only (no machine effect)",
           "pred_zone_game": "Baseline: zone x game average", "pred_persistence": "Baseline: machine persistence"}


def period_table(test: pd.DataFrame) -> pd.DataFrame:
    """Machine-period (May-Jun) rates: ratio of sums for actual and each prediction."""
    agg = {"h": ("available_hours", "sum"), "a": ("actual_x_h", "sum")}
    t = test.assign(actual_x_h=test["actual"] * test["available_hours"],
                    **{f"{k}_x_h": test[k] * test["available_hours"] for k in METHODS})
    agg.update({k: (f"{k}_x_h", "sum") for k in METHODS})
    g = t.groupby("machine_id").agg(**agg)
    out = pd.DataFrame({"actual": g.a / g.h, "hours": g.h})
    for k in METHODS:
        out[k] = g[k] / g.h
    return out


def metrics(run: dict, moved_or_new: list[str], seed: int = 7, reps: int = 2000) -> pd.DataFrame:
    test = run["test"]
    per = period_table(test)
    rng = np.random.default_rng(seed)
    ids = per.index.to_numpy()
    rows = []
    for k, label in METHODS.items():
        err_p = per[k] - per["actual"]
        err_d = test[k] - test["actual"]
        sub = per.loc[per.index.isin(moved_or_new)]
        r = {"target": run["target"], "method": k, "label": label,
             "mae_machine_period": float(np.abs(err_p).mean()),
             "bias_machine_period": float(err_p.mean()),
             "mae_machine_day": float(np.abs(err_d).mean()),
             "mae_machine_day_hours_weighted": float(np.average(np.abs(err_d), weights=test["available_hours"])),
             "mae_moved_or_new": float(np.abs(sub[k] - sub["actual"]).mean()) if len(sub) else np.nan,
             "mean_actual_rate": float(per["actual"].mean()),
             "machines": len(per), "machine_days": len(test)}
        for base in ("pred_zone_game", "pred_persistence"):
            diffs = []
            a_err, b_err = np.abs(per[k] - per["actual"]).to_numpy(), np.abs(per[base] - per["actual"]).to_numpy()
            for _ in range(reps):
                i = rng.integers(0, len(ids), len(ids))
                diffs.append(a_err[i].mean() - b_err[i].mean())
            r[f"mae_diff_vs_{base}"] = float(a_err.mean() - b_err.mean())
            r[f"mae_diff_vs_{base}_lo"], r[f"mae_diff_vs_{base}_hi"] = np.percentile(diffs, [2.5, 97.5])
        rows.append(r)
    return pd.DataFrame(rows)


def leakage_test(days: pd.DataFrame, ev: pd.DataFrame, target: str, reference: pd.Series) -> float:
    """Scramble every May-Jun outcome; predictions for May-Jun must not change."""
    rng = np.random.default_rng(0)
    scr = days.copy()
    test_mask = scr["gaming_date"] >= TEST_START
    for c in ("theo_usd", "coin_in_usd", "occupied_hours"):
        scr.loc[test_mask, c] = rng.permutation(scr.loc[test_mask, c].to_numpy()) * rng.uniform(0.5, 1.5, test_mask.sum())
    run = frozen_run(scr, ev, target)
    return float(np.max(np.abs(run["test"]["pred_model"].to_numpy() - reference.to_numpy())))

"""Q1 reference implementation (Python) of every calculation the app does for a period.

The app (web/lib/q1.ts) re-implements this in TypeScript; `royale.q1_reference --check` compares the
two on several periods so the page's numbers are verified. Spec: docs/Q1.md.

Per machine, over the chosen days:
- expected theo = leave-one-out prediction x the rest of the floor's actual/predicted that same day (D-082)
- play: R = sum(theo) / sum(expected theo); weekly ratio-estimator SE; z = (R-1)/SE (needs >= 2 weeks);
  p from a t-distribution with (weeks - 1) df (D-082)
- shrink: w = tau2 / (tau2 + SE^2), tau2 = how much machines really differ (full window, fixed prior);
  play $ short = w * (expected - theo)
- luck: L = house win - theo; SD = sqrt(sum luck_var)/100; z = L/SD
- availability: fault tickets k vs its maker's rate x its days; one-sided Poisson p = P(X >= k)
- exposure: its bank's occupancy (share of open time someone plays) vs the floor's, weekly, per bank (same t-test)
- every test: one-sided, Holm 5% across the machines (or banks) in scope
- score $ short = play $ short + (luck proven ? its whole luck shortfall : 0)
Run: uv run python -m royale.q1_reference [--from 2025-01-01 --to 2025-06-30] [--check]
"""
from __future__ import annotations

import argparse
import json

import duckdb
import numpy as np
import pandas as pd
from scipy import stats

from royale import targets

ALPHA = 0.05
MIN_DAYS = 30
MIN_WEEKS = 2  # D-080b: no extra minimum; 2 weeks is the least that gives a week-to-week spread at all


def load(con) -> pd.DataFrame:
    g, b = targets.load()["gold"], targets.load()["bronze"]
    return con.execute(f"""
        SELECT m.machine_id, m.gaming_date, m.bank_id, m.zone_id, m.config_id, m.manufacturer,
               m.theo_usd AS theo, m.house_win_usd AS hw, m.coin_in_usd AS coin, m.available_hours AS ah,
               m.scheduled_hours AS sh, m.occupied_hours AS oh, m.luck_var_cents2 AS lv,
               e.expected_theo_usd AS et, COALESCE(m.faults_opened, 0) AS f
        FROM {g}.machine_day m JOIN {g}.q1_expected_day e USING (machine_id, gaming_date)
        ORDER BY m.gaming_date, m.machine_id""").df()


def holm(p: np.ndarray) -> np.ndarray:
    p = np.asarray(p, float)
    out = np.full_like(p, np.nan)
    ok = ~np.isnan(p)
    pv = p[ok]
    m = len(pv)
    order = np.argsort(pv)
    adj = np.maximum.accumulate(np.minimum(1, (m - np.arange(m)) * pv[order]))
    res = np.empty(m)
    res[order] = adj
    out[ok] = res
    return out


def ratio_test(a_w: np.ndarray, e_w: np.ndarray):
    """Weekly ratio estimator. Returns R, SE, z and the one-sided p (below) from a t-distribution with
    (weeks - 1) degrees of freedom, because a spread measured from few weeks is itself uncertain (D-082)."""
    n = len(a_w)
    R = a_w.sum() / e_w.sum()
    if n < MIN_WEEKS:
        return R, np.nan, np.nan, np.nan
    se = np.sqrt(((a_w - R * e_w) ** 2).sum() / (n * (n - 1))) / e_w.mean()
    z = (R - 1) / se if se > 0 else np.nan
    return R, se, z, stats.t.cdf(z, n - 1) if not np.isnan(z) else np.nan


def same_day(df: pd.DataFrame) -> pd.DataFrame:
    """D-082: scale each machine's daily prediction by how the REST of the floor did against its
    predictions that same day, so a floor-wide good or bad day (season, weather, demand) doesn't count
    for or against one machine. Leaves the machine itself out of its own day factor."""
    day = df.groupby("gaming_date")[["theo", "et"]].transform("sum")
    return df.assign(et=df.et * (day.theo - df.theo) / (day.et - df.et))


def tau2_prior(df: pd.DataFrame) -> float:
    rows = []
    df = same_day(df)
    df = df.assign(week=pd.to_datetime(df.gaming_date).dt.to_period("W-SUN"))
    for _, g in df.groupby("machine_id"):
        w = g.groupby("week")[["theo", "et"]].sum()
        R, se, _, _ = ratio_test(w.theo.values, w.et.values)
        if not np.isnan(se):
            rows.append((R, se))
    r = np.array(rows)
    return float(max(r[:, 0].var(ddof=1) - (r[:, 1] ** 2).mean(), 1e-6))


def compute(df: pd.DataFrame, frm: str, to: str, tau2: float) -> pd.DataFrame:
    df = same_day(df)  # whole days, so calibrating before or after the date filter is the same
    gd = pd.to_datetime(df.gaming_date)
    d = df[(gd >= pd.Timestamp(frm)) & (gd <= pd.Timestamp(to))].copy()
    period_days = (pd.Timestamp(to) - pd.Timestamp(frm)).days + 1
    d["week"] = pd.to_datetime(d.gaming_date).dt.to_period("W-SUN")

    # exposure: is the bank's OCCUPANCY (share of open time someone is playing) below the floor's? weekly
    floor_w = d.groupby("week").apply(lambda x: x.oh.sum() / x.ah.sum(), include_groups=False)
    bw = d.groupby(["bank_id", "week"]).agg(oh=("oh", "sum"), ah=("ah", "sum")).reset_index()
    bw["exp"] = bw.ah * bw.week.map(floor_w)
    banks = []
    for bank, g in bw.groupby("bank_id"):
        R, se, z, p = ratio_test(g.oh.values, g.exp.values)
        banks.append((bank, R, z, p))
    banks = pd.DataFrame(banks, columns=["bank_id", "bank_ratio", "bank_z", "bank_p"])
    banks["bank_p_holm"] = holm(banks.bank_p.values)

    maker_rate = d.groupby("manufacturer").agg(f=("f", "sum"), n=("f", "size"))
    maker_rate = (maker_rate.f / maker_rate.n).to_dict()

    out = []
    for mid, g in d.groupby("machine_id"):
        w = g.groupby("week")[["theo", "et"]].sum()
        R, se, zp, pp = ratio_test(w.theo.values, w.et.values)
        A, E = g.theo.sum(), g.et.sum()
        wgt = tau2 / (tau2 + se ** 2) if not np.isnan(se) else 0.0
        L = g.hw.sum() - A
        sd = np.sqrt(g.lv.sum()) / 100
        k, days = int(g.f.sum()), len(g)
        lam = maker_rate[g.manufacturer.iloc[-1]] * days
        out.append({
            "machine_id": mid, "days": days, "bank_id": g.bank_id.iloc[-1], "zone_id": g.zone_id.iloc[-1],
            "theo": A, "expected": E, "ratio": R, "play_se": se, "play_z": zp,
            "play_p": pp,
            "weight": wgt, "play_short": wgt * (E - A), "shrunk_gap": wgt * (1 - R),
            "luck": L, "luck_z": L / sd if sd > 0 else np.nan, "luck_p": stats.norm.cdf(L / sd) if sd > 0 else np.nan,
            "faults": k, "faults_expected": lam, "avail_p": stats.poisson.sf(k - 1, lam) if lam > 0 else np.nan,
            "uptime": g.ah.sum() / g.sh.sum(), "occupancy": g.oh.sum() / g.ah.sum(),
            "tpah": A / g.ah.sum(), "cpah": g.coin.sum() / g.ah.sum(),
        })
    o = pd.DataFrame(out).merge(banks, on="bank_id", how="left")
    for t in ("play", "luck", "avail"):
        o[f"{t}_p_holm"] = holm(o[f"{t}_p"].values)
    min_days = min(MIN_DAYS, period_days)
    o["L_quiet"] = o.bank_p_holm < ALPHA
    o["L_down"] = o.avail_p_holm < ALPHA
    o["L_paying"] = o.luck_p_holm < ALPHA
    o["L_unpopular"] = o.play_p_holm < ALPHA
    o["L_new"] = o.days < min_days
    o["L_unconfirmed"] = (~o.L_down & (o.avail_p < ALPHA)) | (~o.L_paying & (o.luck_p < ALPHA)) | (~o.L_unpopular & (o.play_p < ALPHA))
    o["score"] = o.play_short + np.where(o.L_paying, np.maximum(-o.luck, 0), 0)
    o = o.sort_values("score", ascending=False).reset_index(drop=True)
    o["rank"] = np.arange(1, len(o) + 1)
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm", default="2025-01-01")
    ap.add_argument("--to", default="2025-06-30")
    ap.add_argument("--json", help="write results to this path (used by the app check)")
    a = ap.parse_args()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    df = load(con)
    tau2 = tau2_prior(df)
    o = compute(df, a.frm, a.to, tau2)
    print(f"tau2 prior = {tau2:.6f} (typical real machine difference {np.sqrt(tau2) * 100:.1f}%)")
    labs = ["L_quiet", "L_down", "L_paying", "L_unpopular", "L_new", "L_unconfirmed"]
    print("label counts:", {l: int(o[l].sum()) for l in labs})
    pd.set_option("display.width", 200)
    print(o.head(10)[["rank", "machine_id", "days", "score", "play_short", "shrunk_gap", "play_z", "luck_z", "faults", "faults_expected"] + labs].round(3).to_string(index=False))
    if a.json:
        o.replace({np.nan: None}).to_json(a.json, orient="records")
        print("wrote", a.json)


if __name__ == "__main__":
    main()

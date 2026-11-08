"""Evidence for the Q1 claims that need the full tests (t-test, Holm), which plain SQL can't do.

C19: label counts for Jan 1 - Jun 30, with the banks, machines and numbers behind each label.
C20: short windows: proven "unpopular" flags in every 2-week window, with the tests as built (D-082)
     vs the earlier version (normal test, no same-day adjustment), and the full window for comparison.

Uses royale/q1_reference.py, which the app matches on 4 periods (royale/q1_check_app.py).
Run: uv run python -m royale.q1_claims [C19] [C20]
"""
from __future__ import annotations

import sys
import warnings

import duckdb
import numpy as np
import pandas as pd
from scipy import stats

from royale import q1_reference as Q, targets

warnings.filterwarnings("ignore")
pd.set_option("display.width", 200)


def c19(df: pd.DataFrame, tau2: float) -> None:
    o = Q.compute(df, "2025-01-01", "2025-06-30", tau2)
    print(f"== C19: Q1 labels, Jan 1 - Jun 30 ({len(o)} machines; tau2 prior {tau2:.7f})")
    low = o.L_new | o.L_unconfirmed
    print({"Unpopular unit": int(o.L_unpopular.sum()), "Paying too much: inspect": int(o.L_paying.sum()),
           "Down too often": int(o.L_down.sum()), "Quiet spot": int(o.L_quiet.sum()),
           "Low sample size": int(low.sum()),
           "Normal": int((~(o.L_unpopular | o.L_paying | o.L_down | o.L_quiet | low)).sum())})
    u = o[o.L_unpopular].sort_values("play_z")
    print("\nUnpopular unit (play below prediction, proven after Holm):")
    print(u[["machine_id", "zone_id", "bank_id", "ratio", "shrunk_gap", "play_z", "play_p_holm"]].round(4).to_string(index=False))
    print("\nPaying too much (luck shortfall beyond chance):")
    print(o[o.L_paying][["machine_id", "luck", "luck_z", "luck_p_holm"]].round(6).to_string(index=False))
    q = (o[o.L_quiet].groupby(["zone_id", "bank_id"])
         .agg(machines=("machine_id", "size"), occupancy_vs_floor=("bank_ratio", "first"), p_holm=("bank_p_holm", "first"))
         .reset_index().sort_values("occupancy_vs_floor"))
    print(f"\nQuiet spot: {len(q)} banks, {int(q.machines.sum())} machines (bank occupancy vs floor, proven after Holm):")
    print(q.round(4).to_string(index=False))
    print("\nBy zone:", o[o.L_quiet].zone_id.value_counts().to_dict(), "of", o.zone_id.value_counts().to_dict())
    d = o.assign(excess=o.faults - o.faults_expected).sort_values("avail_p").head(3)
    print("\nDown too often: none proven. Smallest breakdown p-values:")
    print(d[["machine_id", "faults", "faults_expected", "avail_p", "avail_p_holm"]].round(4).to_string(index=False))


def _old_ratio_test(a_w, e_w):
    """Earlier version (before D-082): normal p instead of t."""
    R, se, z, _ = _new_ratio_test(a_w, e_w)
    return R, se, z, stats.norm.cdf(z) if not np.isnan(z) else np.nan


_new_ratio_test, _new_same_day = Q.ratio_test, Q.same_day


def c20(df: pd.DataFrame) -> None:
    print("\n== C20: proven 'Unpopular unit' flags by window (as built vs earlier version)")
    rows = []
    for version in ("as built (D-082)", "earlier"):
        Q.ratio_test, Q.same_day = (_new_ratio_test, _new_same_day) if version.startswith("as built") else (_old_ratio_test, lambda x: x)
        tau2 = Q.tau2_prior(df)
        windows = [(s, s + pd.Timedelta(days=13)) for s in pd.date_range("2025-01-01", "2025-06-17", freq="14D")]
        windows.append((pd.Timestamp("2025-01-01"), pd.Timestamp("2025-06-30")))
        for s, e in windows:
            o = Q.compute(df, s.date().isoformat(), e.date().isoformat(), tau2)
            above = int((Q.holm(1 - o.play_p.values) < Q.ALPHA).sum())
            rows.append(dict(version=version, window=f"{s.date()}..{e.date()}", days=(e - s).days + 1,
                             proven_below=int(o.L_unpopular.sum()), proven_above=above))
    Q.ratio_test, Q.same_day = _new_ratio_test, _new_same_day
    r = pd.DataFrame(rows)
    print(r.pivot(index="window", columns="version", values=["proven_below", "proven_above"]).to_string())
    two = r[r.days == 14].groupby("version")[["proven_below", "proven_above"]].agg(["min", "max", "mean"]).round(1)
    print("\n2-week windows, summary:\n" + two.to_string())


def main():
    want = set(sys.argv[1:]) or {"C19", "C20"}
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    df = Q.load(con)
    if "C19" in want:
        c19(df, Q.tau2_prior(df))
    if "C20" in want:
        c20(df)


if __name__ == "__main__":
    main()

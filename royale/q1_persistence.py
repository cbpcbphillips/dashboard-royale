"""Does the machine ranking hold up out of sample? (claim C24)

Same time split as the forecast test: flag machines using January-April only (labels, top 10, and the shrinkage
prior estimated on Jan-Apr too, so nothing from May-June is used), then look at how those machines did in
May-June against their own same-day prediction. If the flags are real, flagged machines should still run below
prediction in May-June; if they were noise, they should drift back to about 100%.

Run: uv run python -m royale.q1_persistence [--no-databricks]
Writes gold.q1_persistence (DuckDB + Databricks).
"""
from __future__ import annotations

import argparse
import warnings

import duckdb
import numpy as np
import pandas as pd

from royale import q1_reference as Q, targets

warnings.filterwarnings("ignore")


def boot_diff(a: np.ndarray, b: np.ndarray, reps: int = 2000, seed: int = 7):
    rng = np.random.default_rng(seed)
    d = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() for _ in range(reps)]
    return float(a.mean() - b.mean()), *map(float, np.percentile(d, [2.5, 97.5]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    args = ap.parse_args()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    df = Q.load(con)
    con.close()
    gd = pd.to_datetime(df.gaming_date)
    tau2_train = Q.tau2_prior(df[gd <= "2025-04-30"])
    early = Q.compute(df, "2025-01-01", "2025-04-30", tau2_train).set_index("machine_id")
    late = Q.compute(df, "2025-05-01", "2025-06-30", tau2_train).set_index("machine_id")
    both = early.index.intersection(late.index)
    early, late = early.loc[both], late.loc[both]

    groups = {
        "Unpopular unit (proven, Jan–Apr)": early.L_unpopular,
        "Top 10 underperformers (Jan–Apr)": early["rank"] <= 10,
        "Not proven yet: play (Jan–Apr)": early.L_unconfirmed & ~early.L_unpopular & (early.play_p < Q.ALPHA),
        "Everyone else": ~early.L_unpopular & ~(early["rank"] <= 10),
    }
    rest = late.ratio[groups["Everyone else"]].to_numpy()
    rows = []
    for name, m in groups.items():
        r = late.ratio[m].to_numpy()
        diff, lo, hi = boot_diff(r, rest) if name != "Everyone else" and len(r) else (np.nan, np.nan, np.nan)
        rows.append({"group": name, "machines": int(m.sum()),
                     "jan_apr_play_vs_prediction": float(early.ratio[m].mean()),
                     "may_jun_play_vs_prediction": float(r.mean()) if len(r) else np.nan,
                     "may_jun_vs_everyone_else": diff, "lo": lo, "hi": hi,
                     "still_below_in_may_jun": float((r < 1).mean()) if len(r) else np.nan})
    out = pd.DataFrame(rows)
    out["tau2_prior_jan_apr"] = tau2_train
    pd.set_option("display.width", 200)
    print(out.round(4).to_string(index=False))

    g = targets.load()["gold"]
    con = duckdb.connect(str(targets.LOCAL_DB))
    con.register("df_tmp", out)
    con.execute(f"CREATE OR REPLACE TABLE {g}.q1_persistence AS SELECT * FROM df_tmp")
    con.close()
    if not args.no_databricks:
        from royale import dbx
        dbx.write_table(out, f"{targets.prefixes('databricks')['gold']}.q1_persistence", targets.volume_root())
        print("wrote gold.q1_persistence to Databricks")


if __name__ == "__main__":
    main()

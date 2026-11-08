"""Q1 uncertainty and replacement economics (D-025), written to gold on both engines.

- 95% intervals for the machine-vs-peer ratios, from a bootstrap that resamples whole
  weeks (keeps weekday patterns together) and recomputes each ratio of sums.
- Expected 30-day net gain from replacing a machine on July 1 with a leased or purchased
  title, assuming the new machine earns like its bank-mates did (theo per available hour).

Run: uv run python -m royale.q1_stats
"""
import json

import duckdb
import numpy as np
import pandas as pd

from royale import targets

B = 2000
SEED = 20251107
HORIZON_DAYS = 30


def catalog_costs(con) -> dict:
    rows = con.execute(f"""SELECT action_type_id, unit_cost_cents, recurring_cost_cents_per_day,
                              lead_days, downtime_minutes
                       FROM {targets.load()['bronze']}.action_catalog
                       WHERE action_type_id IN ('A-REPLACE-LEASE', 'A-REPLACE-BUY')""").fetchall()
    out = {}
    for a, unit, daily, lead, down in rows:
        days = max(0, HORIZON_DAYS - lead)
        out[a] = {"cost_usd": (unit + daily * days) / 100, "benefit_days": days, "downtime_hours": down / 60}
    return out


def bootstrap(con) -> pd.DataFrame:
    gold = targets.load()["gold"]
    d = con.execute(f"""
        SELECT machine_id, date_trunc('week', gaming_date) AS week,
               SUM(available_hours) a, SUM(occupied_hours) o, SUM(coin_in_usd) ci, SUM(theo_usd) th,
               SUM(bank_avail) ba, SUM(bank_occ) bo, SUM(bank_coin_in) bci, SUM(bank_theo) bth
        FROM {gold}.machine_day_peers GROUP BY ALL ORDER BY 1, 2""").df()
    rng = np.random.default_rng(SEED)
    out = []
    for mid, g in d.groupby("machine_id", sort=True):
        x = g[["a", "o", "ci", "th", "ba", "bo", "bci", "bth"]].to_numpy()
        idx = rng.integers(0, len(x), size=(B, len(x)))
        s = x[idx].sum(axis=1)  # B x 8 resampled sums
        a, o, ci, th, ba, bo, bci, bth = s.T
        stats = {
            "occ_vs_bank": (o / a) / (bo / ba),
            "cpah_vs_bank": (ci / a) / (bci / ba),
            "tpah_vs_bank": (th / a) / (bth / ba),
            "tpah_gap_vs_bank": bth / ba - th / a,  # theo gap: includes swapping to a higher-hold game
            "cpah_gap_vs_bank": bci / ba - ci / a,  # demand gap: coin-in per hour the spot attracts
        }
        row = {"machine_id": mid, "weeks": len(x)}
        for k, v in stats.items():
            row[f"{k}_lo"], row[f"{k}_hi"] = np.percentile(v, [2.5, 97.5])
        out.append(row)
    return pd.DataFrame(out)


def main():
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB))
    ci = bootstrap(con)
    m = con.execute(f"SELECT * FROM {t['gold']}.machine_metrics_full").df()
    costs = catalog_costs(con)

    cols = ["machine_id", "retired", "tpah", "bank_tpah", "cpah", "bank_cpah", "theo_hold", "avail_hours_per_day"]
    q = m[cols].merge(ci, on="machine_id")
    q["tpah_gap_vs_bank"] = q["bank_tpah"] - q["tpah"]
    q["cpah_gap_vs_bank"] = q["bank_cpah"] - q["cpah"]
    # D-025: primary score counts only lost PLAY (demand gap x the machine's own hold);
    # the hold-swap version (theo gap) is kept separately and flagged as an assumption.
    gaps = {
        "": ("cpah_gap_vs_bank", q["theo_hold"]),
        "_holdswap": ("tpah_gap_vs_bank", 1.0),
    }
    for action, key in (("A-REPLACE-LEASE", "lease"), ("A-REPLACE-BUY", "buy")):
        c = costs[action]
        per_day = q["avail_hours_per_day"]
        downtime_loss = c["downtime_hours"] * q["tpah"]
        for variant, (gap_col, mult) in gaps.items():
            for suffix in ("", "_lo", "_hi"):
                gap = q[f"{gap_col}{suffix}"] * mult
                gain = gap * per_day * c["benefit_days"] - downtime_loss - c["cost_usd"]
                q[f"net_gain_30d_{key}{variant}{suffix}"] = np.where(q["retired"], np.nan, gain)
        q[f"{key}_cost_usd"] = c["cost_usd"]
        q[f"{key}_benefit_days"] = c["benefit_days"]
    q = q.drop(columns=["retired", "tpah", "bank_tpah", "cpah", "bank_cpah", "theo_hold", "avail_hours_per_day"])
    q["bootstrap_reps"] = B
    q["bootstrap_seed"] = SEED

    con.execute(f"CREATE OR REPLACE TABLE {t['gold']}.machine_q1_stats AS SELECT * FROM q")
    con.close()
    print(f"duckdb: {t['gold']}.machine_q1_stats ({len(q)} rows)")
    from royale import dbx
    dbx.write_table(q, f"{targets.prefixes('databricks')['gold']}.machine_q1_stats", targets.volume_root())
    print("databricks: machine_q1_stats written")
    print("replacement costs used:", json.dumps(costs))


if __name__ == "__main__":
    main()

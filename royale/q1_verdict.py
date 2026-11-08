"""Q1 verdict: one primary label per machine plus every rule that fired (D-006, D-024, D-025).

Thresholds are the LENIENT set Carson chose after the preview (2026-11-07). They are stored
in every row so the dashboard can show exactly which cutoffs produced a label.
Run: uv run python -m royale.q1_verdict
"""
import json

import duckdb
import numpy as np
import pandas as pd

from royale import targets

THRESHOLDS = {
    "inspect_z": -3.0,          # house win this far below theo -> too far for luck, inspect
    "watch_z": -2.0,            # unusual but plausibly luck -> watch list
    "min_days": 30,             # fewer days on the floor -> not enough data to judge
    "min_availability": 0.95,   # below this -> downtime problem
    "machine_gap": 0.10,        # >10% below bank-mates (interval) AND below same game in zone
    "min_zone_game_peers": 2,   # need at least this many same-game peers in the zone
    "location_effect": 0.85,    # bank or zone earning rate below 85% of the floor rate
}
ORDER = ["Already retired", "Too little data", "Inspect (leak?)", "Downtime", "Machine/game",
         "Location", "Watch (luck?)", "OK"]


def rules(r) -> list[tuple[str, str]]:
    t, fired = THRESHOLDS, []
    if r.retired:
        fired.append(("Already retired", f"retired {r.retire_date}; {r.days_on_floor} days on floor"))
    if r.days_on_floor < t["min_days"]:
        fired.append(("Too little data", f"only {r.days_on_floor} days on the floor"))
    if r.luck_z <= t["inspect_z"]:
        fired.append(("Inspect (leak?)", f"house win ${r.house_win_usd:,.0f} vs theo ${r.theo_usd:,.0f} "
                      f"(hold {r.observed_hold:.1%} vs {r.theo_hold:.1%} configured); luck z {r.luck_z:.2f}"))
    if r.availability < t["min_availability"]:
        fired.append(("Downtime", f"available {r.availability:.1%} of scheduled time"))
    below_bank = min(r.occ_vs_bank_hi, r.cpah_vs_bank_hi) < 1 - t["machine_gap"]
    below_game = (r.avg_zone_game_peers >= t["min_zone_game_peers"]
                  and r.tpah_vs_game_in_zone < 1 - t["machine_gap"])
    if below_bank and below_game:
        fired.append(("Machine/game", f"occupancy {r.occ_vs_bank:.2f}x and coin-in/hr {r.cpah_vs_bank:.2f}x "
                      f"bank-mates; earns {r.tpah_vs_game_in_zone:.2f}x the same game in this zone"))
    if min(r.bank_effect, r.zone_effect) < t["location_effect"]:
        fired.append(("Location", f"bank earns {r.bank_effect:.0%} and zone {r.zone_effect:.0%} of the floor rate; "
                      f"machine occupancy {r.occ_vs_bank:.2f}x bank-mates"))
    if t["inspect_z"] < r.luck_z <= t["watch_z"]:
        fired.append(("Watch (luck?)", f"luck z {r.luck_z:.2f} (unusual, still plausibly luck)"))
    return fired or [("OK", "no rule fired")]


CLAIMS = {"Inspect (leak?)": "C03", "Location": "C02, C04", "Already retired": "C01", "Too little data": "C01"}


def main():
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB))
    m = con.execute(f"""SELECT f.*, s.* EXCLUDE (machine_id)
                        FROM {t['gold']}.machine_metrics_full f
                        JOIN {t['gold']}.machine_q1_stats s USING (machine_id)""").df()
    out = []
    for r in m.itertuples():
        fired = sorted(rules(r), key=lambda x: ORDER.index(x[0]))
        primary = fired[0][0]
        out.append({
            "machine_id": r.machine_id,
            "verdict": primary,
            "all_flags": "; ".join(f for f, _ in fired),
            "reasons": " | ".join(f"{f}: {why}" for f, why in fired),
            "claim_ids": CLAIMS.get(primary, ""),
            "replacement_net_30d_lease": r.net_gain_30d_lease,
            "replacement_net_30d_lease_lo": r.net_gain_30d_lease_lo,
            "replacement_net_30d_lease_hi": r.net_gain_30d_lease_hi,
            "replacement_net_30d_buy": r.net_gain_30d_buy,
            "replacement_net_30d_lease_holdswap": r.net_gain_30d_lease_holdswap,
        })
    v = pd.DataFrame(out)
    cand = v["verdict"].eq("Machine/game")
    v["replacement_rank"] = np.where(cand, v["replacement_net_30d_lease"].where(cand).rank(ascending=False), np.nan)
    v["thresholds_json"] = json.dumps(THRESHOLDS)

    con.execute(f"CREATE OR REPLACE TABLE {t['gold']}.machine_verdict AS SELECT * FROM v")
    con.close()
    from royale import dbx
    dbx.write_table(v, f"{targets.prefixes('databricks')['gold']}.machine_verdict", targets.volume_root())
    print(v["verdict"].value_counts().to_string())
    mgr = m.loc[m.in_manager_bottom10, ["machine_id", "manager_rank"]].merge(v, on="machine_id").sort_values("manager_rank")
    print("\nManager's 10:\n" + mgr[["manager_rank", "machine_id", "verdict", "all_flags"]].to_string(index=False))
    print("\nMachine/game candidates:\n" + v[cand].sort_values("replacement_rank")[
        ["machine_id", "replacement_rank", "replacement_net_30d_lease", "replacement_net_30d_lease_lo",
         "replacement_net_30d_lease_hi", "reasons"]].to_string(index=False))


if __name__ == "__main__":
    main()

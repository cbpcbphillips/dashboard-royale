"""Q2-Q5 reconciliation checks -> docs/evidence/q2q5_validation.md (DuckDB).

Each check compares the same quantity computed from independent tables; they must agree.
Run: uv run python -m royale.q2q5_validate
"""
import datetime as dt
import math

import duckdb

from royale import targets

CHECKS = [
    ("Q2 floor coin-in = property_day coin-in",
     "SELECT SUM(coin_in_usd) FROM {g}.floor_day",
     "SELECT SUM(CAST(coin_in_usd AS DOUBLE)) FROM {b}.property_day"),
    ("Q2 zone-day coin-in = floor coin-in",
     "SELECT SUM(coin_in_usd) FROM {g}.zone_day",
     "SELECT SUM(coin_in_usd) FROM {g}.floor_day"),
    ("Q2 traffic entries (ok/partial) = property_day entries",
     "SELECT SUM(entries_observed) FROM {g}.zone_day",
     "SELECT SUM(total_zone_entries_observed) FROM {b}.property_day"),
    ("Q3 hourly downtime (machine_hour) = daily downtime (machine_day)",
     "SELECT SUM(down_hours) FROM {g}.downtime_machine_day",
     "SELECT SUM(scheduled_hours - available_hours) FROM {g}.machine_day"),
    ("Q3 fault tickets = property_day faults_opened",
     "SELECT COUNT(*) FROM {g}.downtime_ticket WHERE event_type = 'fault_repair'",
     "SELECT SUM(faults_opened) FROM {b}.property_day"),
    ("Q4 tracked coin-in (player_month) = carded coin-in on machine meters",
     "SELECT SUM(coin_in_usd) FROM {g}.player_month",
     "SELECT SUM(carded_coin_in_usd) FROM {g}.machine_day"),
    ("Q4 group summary 'All' theo = player_month theo",
     "SELECT theo_usd FROM {g}.player_group_summary WHERE dimension = 'All players'",
     "SELECT SUM(theo_usd) FROM {g}.player_month"),
    ("Q5 comp cost: ledger (by week) = player_period",
     "SELECT SUM(comp_cost_usd) FROM {g}.comp_week",
     "SELECT SUM(comp_cost_usd) FROM {g}.player_month"),
    ("Q5 comp cost: player_period = property_day = POS comp cogs (counted once)",
     "SELECT SUM(CAST(comp_cost_usd AS DOUBLE)) FROM {b}.property_day",
     "SELECT SUM(cogs_cents) / 100.0 FROM {b}.fnb_transactions WHERE comp_id IS NOT NULL"),
]


def main():
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    lines, ok = ["| Check | A | B | Result |", "|---|---:|---:|---|"], True
    for name, a, b in CHECKS:
        va = float(con.execute(a.format(g=t["gold"], b=t["bronze"])).fetchone()[0])
        vb = float(con.execute(b.format(g=t["gold"], b=t["bronze"])).fetchone()[0])
        good = math.isclose(va, vb, rel_tol=1e-9, abs_tol=0.01)
        ok &= good
        lines.append(f"| {name} | {va:,.2f} | {vb:,.2f} | {'PASS' if good else 'FAIL'} |")
    con.close()
    out = targets.ROOT / "docs" / "evidence" / "q2q5_validation.md"
    out.write_text("\n".join([f"# Q2-Q5 validation ({dt.datetime.now():%Y-%m-%d %H:%M})", "",
                              "Command: `uv run python -m royale.q2q5_validate`", ""] + lines) + "\n")
    print("\n".join(lines))
    print("ALL PASS" if ok else "SOME CHECKS FAILED", "->", out)


if __name__ == "__main__":
    main()

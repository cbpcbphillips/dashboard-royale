"""Export the app's data files from the gold tables (D-057: the public app never queries Databricks).

Reads from Databricks Unity Catalog by default (the pipeline of record); `--source duckdb` reads the
local mirror instead (identical tables, parity-checked). Writes web/data/q1.json (columnar, compact).
Run: uv run python -m royale.export_app [--source databricks|duckdb]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json

import duckdb
import numpy as np
import pandas as pd

from royale import q1_reference, targets

OUT = targets.ROOT / "web" / "data" / "q1.json"

QUERIES = {
    "days": """SELECT m.machine_id, CAST(m.gaming_date AS STRING) AS d, m.location_id, m.bank_id, m.zone_id,
                      m.config_id, m.manufacturer,
                      m.theo_usd AS theo, m.house_win_usd AS hw, m.coin_in_usd AS coin,
                      m.available_hours AS ah, m.scheduled_hours AS sh, m.occupied_hours AS oh,
                      m.luck_var_cents2 AS lv, e.expected_theo_usd AS et, COALESCE(m.faults_opened, 0) AS f
               FROM {g}.machine_day m JOIN {g}.q1_expected_day e
                 ON e.machine_id = m.machine_id AND e.gaming_date = m.gaming_date
               ORDER BY m.gaming_date, m.machine_id""",
    "machines": """SELECT machine_id, manufacturer, theme, lease_class, CAST(install_date AS STRING) AS install_date,
                          CAST(retire_date AS STRING) AS retire_date FROM {b}.machines ORDER BY machine_id""",
    "configs": """SELECT config_id, theme, CAST(configured_rtp AS DOUBLE) AS rtp, volatility_class FROM {b}.game_math""",
    "locations": """SELECT location_id, node_type, zone_id, bank_id, name, x_m, y_m FROM {b}.floor_locations""",
}


def run_queries(source: str, queries: dict[str, str]) -> dict[str, pd.DataFrame]:
    if source == "databricks":
        from royale import dbx
        p = targets.prefixes("databricks")
        with dbx.connect() as conn:
            return {k: dbx.run(conn, q.format(g=p["gold"], b=p["bronze"])) for k, q in queries.items()}
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    out = {k: con.execute(q.replace("AS STRING", "AS VARCHAR").format(g=t["gold"], b=t["bronze"])).df() for k, q in queries.items()}
    con.close()
    return out


def fetch(source: str) -> dict[str, pd.DataFrame]:
    return run_queries(source, QUERIES)


Q2_QUERIES = {
    "zone_day": """SELECT zone_id AS z, CAST(gaming_date AS STRING) AS d, coin_in_usd AS coin, theo_usd AS theo,
                          available_hours AS ah, occupied_hours AS oh, entries_observed AS ent,
                          covered_sensor_hours AS cov, walkway_closed AS wc
                   FROM {g}.zone_day ORDER BY gaming_date, zone_id""",
    "events": """SELECT name, event_type, local_scope, CAST(start_date AS STRING) AS start_date,
                        CAST(end_date AS STRING) AS end_date, event_days, uplift, uplift_lo, uplift_hi,
                        extra_coin_in_usd FROM {g}.event_uplift ORDER BY start_date""",
    "walkway": """SELECT area, period, days, occupancy, cpah, entries_per_covered_hour FROM {g}.walkway_periods
                  ORDER BY area, period""",
    "zones": """SELECT zone_id, name FROM {b}.floor_locations WHERE node_type = 'zone' ORDER BY zone_id""",
}


def export_q2(source: str) -> None:
    """Q2 demand: zone x day machine meters + door/zone counter traffic, event lift, walkway periods."""
    t = run_queries(source, Q2_QUERIES)
    zd = t["zone_day"]
    zd["d"] = zd["d"].astype(str).str[:10]
    dates = sorted(zd.d.unique())
    d_idx = {d: i for i, d in enumerate(dates)}
    r = lambda s, n=2: [None if pd.isna(v) else round(float(v), n) for v in s]
    payload = {
        "meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                 "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.zone_day, event_uplift, walkway_periods"},
        "dates": dates,
        "zones": clean(t["zones"]),
        "rows": {"z": list(zd.z), "d": [d_idx[v] for v in zd.d], "coin": r(zd.coin), "theo": r(zd.theo),
                 "ah": r(zd.ah, 3), "oh": r(zd.oh, 3), "ent": r(zd.ent, 0), "cov": r(zd["cov"], 3), "wc": [int(v) for v in zd.wc]},
        "events": clean(t["events"]),
        "walkway": clean(t["walkway"]),
    }
    out = OUT.parent / "q2.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB) from {source}: {len(zd):,} zone-days, {len(t['events'])} events")


Q3_QUERIES = {
    "down": """SELECT machine_id AS m, CAST(gaming_date AS STRING) AS d, zone_id AS z, bank_id AS b, manufacturer AS mk,
                      down_hours AS h, lost_coin_in_usd AS coin, lost_theo_usd AS theo
               FROM {g}.downtime_machine_day ORDER BY gaming_date, machine_id""",
    "tickets": """SELECT CAST(gaming_date AS STRING) AS d, shift, zone_id AS z, bank_id AS b, manufacturer AS mk,
                         wait_hours AS w, down_hours AS h
                  FROM {g}.downtime_ticket WHERE event_type = 'fault_repair' ORDER BY gaming_date""",
    "shifts": """SELECT CAST(gaming_date AS STRING) AS d, shift, planned_techs AS p, actual_techs AS a, faults AS f,
                        wait_hours AS w FROM {g}.tech_shift_day ORDER BY gaming_date, shift""",
    "maker_days": """SELECT CAST(gaming_date AS STRING) AS d, manufacturer AS mk, COUNT(*) AS n, COUNT(DISTINCT machine_id) AS machines
                     FROM {g}.machine_day GROUP BY gaming_date, manufacturer ORDER BY gaming_date, manufacturer""",
    "zones": """SELECT zone_id, name FROM {b}.floor_locations WHERE node_type = 'zone' ORDER BY zone_id""",
    "banks": """SELECT bank_id, zone_id FROM {b}.floor_locations WHERE node_type = 'bank' ORDER BY bank_id""",
}


def export_q3(source: str) -> None:
    """Q3 downtime: lost play per machine-day, fault tickets, slot-tech staffing per shift, machine-days per maker."""
    t = run_queries(source, Q3_QUERIES)
    for k in ("down", "tickets", "shifts", "maker_days"):
        t[k]["d"] = t[k]["d"].astype(str).str[:10]
    cols = lambda df: {c: [None if pd.isna(v) else (round(float(v), 3) if isinstance(v, float) else (int(v) if hasattr(v, "item") and not isinstance(v, str) else v)) for v in df[c]] for c in df.columns}
    payload = {
        "meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                 "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.downtime_machine_day, downtime_ticket, tech_shift_day, machine_day"},
        "zones": clean(t["zones"]), "banks": clean(t["banks"]),
        "down": cols(t["down"]), "tickets": cols(t["tickets"]), "shifts": cols(t["shifts"]), "maker_days": cols(t["maker_days"]),
    }
    out = OUT.parent / "q3.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB) from {source}: {len(t['down'])} down machine-days, {len(t['tickets'])} fault tickets")


Q4_QUERY = {"pm": """SELECT player_id, CAST(period_month AS STRING) AS month, opening_tier, age_band, home_region,
                           coin_in_usd, payout_usd, net_usd, theo_usd, luck_usd, observed_visits, comp_cost_usd
                    FROM {g}.player_month"""}
Q4_DIMS = {"Loyalty tier": "opening_tier", "Age band": "age_band", "Home region": "home_region"}


def export_q4(source: str) -> None:
    """Q4 tracked players. player_period is monthly, so every whole-month range is precomputed: players are
    summed over the months FIRST, then ahead rate and concentration are computed (never per-month ratios)."""
    pm = run_queries(source, Q4_QUERY)["pm"]
    pm["month"] = pm["month"].astype(str).str[:7]
    num = ["coin_in_usd", "payout_usd", "net_usd", "theo_usd", "luck_usd", "observed_visits", "comp_cost_usd"]
    pm[num] = pm[num].astype(float)
    months = sorted(pm.month.unique())
    out_rows = []
    for i, m0 in enumerate(months):
        for m1 in months[i:]:
            p = (pm[(pm.month >= m0) & (pm.month <= m1)]
                 .groupby(["player_id", "opening_tier", "age_band", "home_region"], as_index=False)[num].sum())
            p = p[p.coin_in_usd > 0]
            theo_all, loss_all = p.theo_usd.sum(), -p.net_usd.sum()
            groups = [("All players", "All", p)] + [(dim, g, x) for dim, col in Q4_DIMS.items() for g, x in p.groupby(col)]
            for dim, grp, x in groups:
                x = x.sort_values("theo_usd", ascending=False)
                n = len(x)
                top = lambda q: x.head(max(1, int(round(n * q))))
                cum = x.theo_usd.cumsum() / x.theo_usd.sum()
                lorenz = [round(float(cum.iloc[min(n - 1, max(0, int(round(n * k / 20)) - 1))]), 4) for k in range(1, 21)]
                out_rows.append({
                    "from": m0, "to": m1, "dim": dim, "grp": str(grp), "players": n,
                    "ahead": round(float((x.net_usd > 0).mean()), 4),
                    "coin": round(x.coin_in_usd.sum(), 0), "payout": round(x.payout_usd.sum(), 0), "net": round(x.net_usd.sum(), 0),
                    "theo": round(x.theo_usd.sum(), 0), "luck": round(x.luck_usd.sum(), 0), "comp": round(x.comp_cost_usd.sum(), 0),
                    "visits": round(float(x.observed_visits.sum() / n), 2),
                    "share_theo": round(float(x.theo_usd.sum() / theo_all), 4), "share_loss": round(float(-x.net_usd.sum() / loss_all), 4),
                    "top10_theo": round(float(top(0.10).theo_usd.sum() / x.theo_usd.sum()), 4),
                    "top10_loss": round(float(-top(0.10).net_usd.sum() / -x.net_usd.sum()), 4) if x.net_usd.sum() < 0 else None,
                    "top1_theo": round(float(top(0.01).theo_usd.sum() / x.theo_usd.sum()), 4),
                    "top1_ahead": round(float((top(0.01).net_usd > 0).mean()), 4),
                    "median_net": round(float(x.net_usd.median()), 2),
                    "lorenz": lorenz,
                })
    payload = {"meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                        "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.player_month (tracked = carded play only)"},
               "months": months, "dims": {d: sorted(map(str, pm[c].unique())) for d, c in Q4_DIMS.items()}, "rows": out_rows}
    out = OUT.parent / "q4.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB) from {source}: {len(pm):,} player-months, {len(out_rows)} summaries")


Q5_QUERIES = {
    "weeks": """SELECT CAST(week_start AS STRING) AS week_start, days, redemptions, points_redeemed, comp_face_usd,
                       comp_cost_usd, carded_theo_usd, points_per_comp_face_usd, comp_reinvestment
                FROM {g}.comp_week ORDER BY week_start""",
    "tier_month": """SELECT opening_tier, CAST(period_month AS STRING) AS month, players_with_play, visits, theo_usd,
                            comps_redeemed, comp_cost_usd, comp_face_usd, points_redeemed
                     FROM {g}.comp_tier_month ORDER BY period_month, opening_tier""",
    "change": """SELECT * FROM {g}.comp_change ORDER BY opening_tier""",
}


def export_q5(source: str) -> None:
    """Q5 comps: weekly redemption rate and cost, tier x month, and the before/after change table (C07)."""
    t = run_queries(source, Q5_QUERIES)
    t["weeks"]["week_start"] = t["weeks"]["week_start"].astype(str).str[:10]
    t["tier_month"]["month"] = t["tier_month"]["month"].astype(str).str[:7]
    for k in t:
        for c in t[k].columns:
            if t[k][c].dtype == object and c not in ("week_start", "month", "opening_tier"):
                try:
                    t[k][c] = t[k][c].astype(float)
                except (TypeError, ValueError):
                    t[k][c] = t[k][c].astype(str)
    payload = {"meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                        "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.comp_week, comp_tier_month, comp_change"},
               "weeks": clean(t["weeks"]), "tier_month": clean(t["tier_month"]), "change": clean(t["change"])}
    out = OUT.parent / "q5.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False, default=str))
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB) from {source}: {len(t['weeks'])} weeks")


MODEL_QUERIES = {
    "metrics": """SELECT * FROM {g}.model_metrics WHERE target = 'tpah'""",
    "daily": """SELECT CAST(gaming_date AS STRING) AS d, SUM(actual * available_hours) / SUM(available_hours) AS actual,
                       SUM(pred_model * available_hours) / SUM(available_hours) AS model,
                       SUM(pred_zone_game * available_hours) / SUM(available_hours) AS zone_game,
                       SUM(pred_persistence * available_hours) / SUM(available_hours) AS persistence
                FROM {g}.model_predictions WHERE target = 'tpah' GROUP BY gaming_date ORDER BY gaming_date""",
    "moves": """SELECT machine_id, CAST(move_date AS STRING) AS move_date, from_zone, to_zone, actual_before, actual_after,
                       actual_change, predicted_change FROM {g}.model_move_check ORDER BY move_date""",
    "weekday": """SELECT * FROM {g}.model_weekday_baseline""",
    "weekday_daily": """SELECT CAST(gaming_date AS STRING) AS d, weekday FROM {g}.model_weekday_daily ORDER BY gaming_date""",
}


def export_model(source: str) -> None:
    """Model validation for the Evidence tab: frozen forecast (fit Jan-Apr, predict May-Jun) vs baselines (C14, C16)."""
    t = run_queries(source, MODEL_QUERIES)
    t["daily"]["d"] = t["daily"]["d"].astype(str).str[:10]
    t["weekday_daily"]["d"] = t["weekday_daily"]["d"].astype(str).str[:10]
    t["daily"] = t["daily"].merge(t["weekday_daily"], on="d", how="left")
    for k in t:
        for c in t[k].columns:
            if t[k][c].dtype == object and c not in ("d", "machine_id", "move_date", "from_zone", "to_zone", "target", "method", "label", "mlflow_run_id", "baseline", "weekday_factors"):
                t[k][c] = pd.to_numeric(t[k][c], errors="coerce")
    payload = {"meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                        "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.model_metrics, model_predictions, model_move_check; MLflow experiment royale-tpah"},
               "metrics": clean(t["metrics"]), "daily": clean(t["daily"]), "moves": clean(t["moves"]), "weekday": clean(t["weekday"])[0]}
    out = OUT.parent / "model.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False, default=str))
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB) from {source}")


MANAGER_QUERY = {"m": """SELECT manager_rank, machine_id, zone_name, bank_id, days_on_floor,
                                house_win_usd, theo_usd, luck_z,
                                CAST(install_date AS STRING) AS install_date, CAST(retire_date AS STRING) AS retire_date
                         FROM {g}.machine_metrics_full WHERE in_manager_bottom10 ORDER BY manager_rank"""}


def export_manager(source: str) -> None:
    """The general manager's list: the 10 machines with the lowest total house win, Jan 1 - Jun 30 (claim C01)."""
    m = run_queries(source, MANAGER_QUERY)["m"]
    for c in ("house_win_usd", "theo_usd", "luck_z"):
        m[c] = m[c].astype(float)
    payload = {"meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"),
                        "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.machine_metrics_full (manager_rank)"},
               "machines": clean(m)}
    out = OUT.parent / "manager.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False, default=str))
    print(f"wrote {out} from {source}: {len(m)} machines")


def clean(df: pd.DataFrame) -> list[dict]:
    """Records with NaN/NaT turned into null (valid JSON)."""
    return json.loads(df.to_json(orient="records"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["databricks", "duckdb"], default="databricks")
    ap.add_argument("--only", choices=["q1", "q2", "q3", "q4", "q5", "model", "manager"], help="export just one page's data")
    a = ap.parse_args()
    source = a.source
    if a.only in (None, "q2"):
        export_q2(source)
    if a.only in (None, "q3"):
        export_q3(source)
    if a.only in (None, "q4"):
        export_q4(source)
    if a.only in (None, "q5"):
        export_q5(source)
    if a.only in (None, "model"):
        export_model(source)
    if a.only in (None, "manager"):
        export_manager(source)
    if a.only in ("q2", "q3", "q4", "q5", "model", "manager"):
        return
    t = fetch(source)
    days = t["days"]
    days["d"] = days["d"].astype(str).str[:10]

    machines = t["machines"]
    m_idx = {m: i for i, m in enumerate(machines.machine_id)}
    dates = sorted(days.d.unique())
    d_idx = {d: i for i, d in enumerate(dates)}
    loc = t["locations"]
    slots = loc[loc.node_type == "slot"].sort_values("location_id").reset_index(drop=True)
    s_idx = {s: i for i, s in enumerate(slots.location_id)}

    # tau2 prior (how much machines really differ once spot and game are known), from the full window
    ref = days.rename(columns={"d": "gaming_date"}).assign(gaming_date=lambda x: pd.to_datetime(x.gaming_date).dt.date)
    tau2 = q1_reference.tau2_prior(ref)

    r2 = lambda s: [round(float(v), 2) for v in s]
    payload = {
        "meta": {
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
            "source": f"{'Databricks Unity Catalog' if source == 'databricks' else 'local DuckDB mirror'}: royale.gold.machine_day, royale.gold.q1_expected_day",
            "tau2": tau2,
            "window": [dates[0], dates[-1]],
            "manifest_sha256_16": hashlib.sha256(targets.MANIFEST.read_bytes()).hexdigest()[:16],
            "notes": "Expected theo is a leave-one-out prediction (royale/q1_loo.py); money in dollars; hours from scheduled seconds.",
        },
        "machines": clean(machines),
        "configs": clean(t["configs"]),
        "zones": clean(loc[loc.node_type == "zone"][["zone_id", "name", "x_m", "y_m"]]),
        "banks": clean(loc[loc.node_type == "bank"][["bank_id", "zone_id", "name", "x_m", "y_m"]]),
        "slots": clean(slots[["location_id", "zone_id", "bank_id", "x_m", "y_m"]]),
        "dates": dates,
        "rows": {
            "m": [m_idx[v] for v in days.machine_id],
            "d": [d_idx[v] for v in days.d],
            "s": [s_idx.get(v, -1) for v in days.location_id],
            "bank": list(days.bank_id),
            "zone": list(days.zone_id),
            "cfg": list(days.config_id),
            "maker": list(days.manufacturer),
            "theo": r2(days.theo), "hw": r2(days.hw), "coin": r2(days.coin), "et": r2(days.et),
            "ah": [round(float(v), 4) for v in days.ah], "sh": [round(float(v), 4) for v in days.sh],
            "oh": [round(float(v), 4) for v in days.oh],
            "lv": [round(float(v)) for v in days.lv],
            "f": [int(v) for v in days.f],
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB) from {source}: {len(days):,} machine-days, "
          f"{len(machines)} machines, {len(slots)} slots, tau2={tau2:.6f}")


if __name__ == "__main__":
    main()

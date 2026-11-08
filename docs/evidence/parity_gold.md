# Parity check: `gold` layer, DuckDB (local parquet) vs Databricks (Delta)

Run: 2026-11-08 07:38 local time · Databricks prefix `royale.gold` · command `uv run python -m royale.parity_check --layer gold`

Checks per column: non-null count; SUM (numbers); true count (booleans); distinct count (text); min/max (dates, timestamps; Databricks session pinned to UTC).

| Table | Rows | Checks | Result |
|---|---:|---:|---|
| budget_actions | 13 | 37 | PASS |
| budget_portfolios | 353 | 17 | PASS |
| comp_change | 5 | 38 | PASS |
| comp_tier_month | 18 | 27 | PASS |
| comp_week | 27 | 28 | PASS |
| demand_dip_tests | 10 | 15 | PASS |
| demand_dip_weekly | 27 | 12 | PASS |
| downtime_machine_day | 1,360 | 18 | PASS |
| downtime_ticket | 1,226 | 32 | PASS |
| event_uplift | 8 | 36 | PASS |
| fault_forecast_shift | 3 | 19 | PASS |
| floor_day | 181 | 58 | PASS |
| floor_forecast_daily | 91 | 16 | PASS |
| floor_forecast_metrics | 2 | 19 | PASS |
| machine_day | 55,092 | 58 | PASS |
| machine_day_peers | 55,092 | 58 | PASS |
| machine_effect | 928 | 23 | PASS |
| machine_metrics_full | 310 | 129 | PASS |
| machine_q1_stats | 310 | 65 | PASS |
| machine_verdict | 310 | 25 | PASS |
| model_challenger | 1 | 63 | PASS |
| model_challenger_daily | 61 | 12 | PASS |
| model_metrics | 8 | 39 | PASS |
| model_move_check | 2 | 29 | PASS |
| model_predictions | 37,576 | 26 | PASS |
| model_weekday_baseline | 1 | 39 | PASS |
| model_weekday_daily | 61 | 6 | PASS |
| move_whatif | 1,398 | 25 | PASS |
| player_dim | 113,890 | 11 | PASS |
| player_group_summary | 18 | 31 | PASS |
| player_month | 148,893 | 47 | PASS |
| q1_expected_day | 55,092 | 12 | PASS |
| q1_persistence | 4 | 19 | PASS |
| tech_shift_day | 543 | 20 | PASS |
| walkway_periods | 6 | 15 | PASS |
| zone_day | 1,267 | 40 | PASS |

**36 of 36 tables match.**

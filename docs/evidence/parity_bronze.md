# Parity check: `bronze` layer, DuckDB (local parquet) vs Databricks (Delta)

Run: 2026-11-07 16:18 local time · Databricks prefix `royale.bronze` · command `uv run python -m royale.parity_check --layer bronze`

Checks per column: non-null count; SUM (numbers); true count (booleans); distinct count (text); min/max (dates, timestamps; Databricks session pinned to UTC).

| Table | Rows | Checks | Result |
|---|---:|---:|---|
| action_catalog | 13 | 21 | PASS |
| benchmark_property_monthly | 78 | 30 | PASS |
| benchmark_public | 700 | 34 | PASS |
| benchmark_state_monthly | 6 | 22 | PASS |
| calendar_day | 181 | 24 | PASS |
| city_visitation_monthly | 6 | 31 | PASS |
| cost_rules | 9 | 23 | PASS |
| events | 8 | 22 | PASS |
| floor_locations | 378 | 21 | PASS |
| floor_walkways | 10 | 17 | PASS |
| fnb_transactions | 227,833 | 32 | PASS |
| game_math | 10 | 23 | PASS |
| loyalty_ledger | 782,773 | 29 | PASS |
| machine_day | 56,110 | 42 | PASS |
| machine_hour | 1,321,908 | 38 | PASS |
| machines | 310 | 15 | PASS |
| operations | 1,226 | 26 | PASS |
| placements | 314 | 15 | PASS |
| player_period | 148,893 | 47 | PASS |
| players | 113,890 | 17 | PASS |
| prepared_daily_view | 56,110 | 90 | PASS |
| property_day | 181 | 50 | PASS |
| security_incidents | 3,865 | 26 | PASS |
| sessions | 776,297 | 45 | PASS |
| shift_roster | 10,317 | 22 | PASS |
| trips | 351,729 | 21 | PASS |
| visitor_profile_monthly | 42 | 17 | PASS |
| visitor_profile_segments | 1,406 | 34 | PASS |
| visitor_profile_summary | 74 | 34 | PASS |
| weather_daily | 181 | 48 | PASS |
| zone_traffic_hourly | 30,401 | 24 | PASS |

**31 of 31 tables match.**

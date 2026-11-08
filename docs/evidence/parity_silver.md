# Parity check: `silver` layer, DuckDB (local parquet) vs Databricks (Delta)

Run: 2026-11-07 15:53 local time · Databricks prefix `royale.silver` · command `uv run python -m royale.parity_check --layer silver`

Checks per column: non-null count; SUM (numbers); true count (booleans); distinct count (text); min/max (dates, timestamps; Databricks session pinned to UTC).

| Table | Rows | Checks | Result |
|---|---:|---:|---|
| machine_day_active | 55,092 | 36 | PASS |

**1 of 1 tables match.**

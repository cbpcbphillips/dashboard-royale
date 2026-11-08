# Stage A2 — Databricks Free Edition setup (plan)

Status: **ready to run.** Decided: D-016 CLI + Python SDK with browser OAuth · D-017 try catalog `royale` (schemas raw/bronze/silver/gold), fall back to `workspace.royale_*` · D-018 shared SQL files run through the SQL warehouse. Time box: **45 minutes** of setup; local DuckDB work continues in parallel.

## Goal (what "done" means)
1. This machine can talk to the workspace without anyone pasting a token into chat or code.
2. All 31 parquet files (112.7 MB) are in a Unity Catalog Volume.
3. All 31 tables exist as **bronze Delta tables**, and a parity check proves they match the local files (row counts, money sums, timestamp spot checks).
4. One shared SQL file builds a silver table identically on Databricks and DuckDB (proves the "same SQL, two engines" design).
5. An MLflow experiment exists and a test run logs from this machine.

## Facts that shape the plan (Free Edition, checked 2026-11-07)
- Serverless only; **one SQL warehouse, 2X-Small**; max 5 concurrent job tasks; up to 3 Apps that auto-stop after 24 h. ([docs](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations))
- **Exceeding the fair-use quota shuts compute down for the rest of the day** (in extreme cases the month). Data is kept. → matters for the live app during judging (D-014).
- **Outbound internet is restricted** → the workspace can't pull our data from GitHub; we push files from this machine.
- One workspace, one metastore; no custom storage locations → creating a new catalog may not be allowed; the default `workspace` catalog always exists.
- Personal access tokens: a third-party guide says they're under Settings → Developer → Access tokens; not confirmed in official Free Edition docs → **verify in the workspace**. Only needed later for the app (Carson creates it and puts it straight into the host's secrets; it never goes in chat or the repo).
- Our parquet timestamps are timezone-naive (`timestamp[us]`). Spark may read them as `TIMESTAMP_NTZ` or shift them by the session time zone → bronze step pins `SET TIME ZONE 'UTC'` and the parity check compares `_utc` and `_local` values row by row on a sample.

## Who does what
| Step | Carson | Claude |
|---|---|---|
| Sign in | Logs into the workspace in a browser; shares the **workspace URL** (not secret) | — |
| Local auth | Completes the browser OAuth prompt that opens | Runs the login command (D-016) |
| Everything else | Approves installs / decisions | Writes and runs scripts, reports results |

## Steps and checkpoints
| Min | Step | Detail | Checkpoint |
|---|---|---|---|
| 0–10 | Connect | Install the chosen tooling (D-016); `auth login` with browser OAuth (U2M); list catalogs, schemas and the SQL warehouse | We can run `SELECT 1` on the warehouse |
| 10–20 | Land files | Create schema + Volume (names per D-017); upload `data/**/*.parquet` keeping folder structure (scripted, re-runnable) | 31 files listed in the Volume, sizes match |
| 20–35 | Bronze | One `CREATE OR REPLACE TABLE … AS SELECT * FROM read_files('<volume path>', format => 'parquet')` per file, generated from `data/manifest.json`; table comments carry the source path + manifest SHA-256 | 31 Delta tables |
| 20–35 ‖ | Local mirror | DuckDB file `local/royale.duckdb` with the **same schema and table names** as views over the parquet files, so SQL text is identical in both engines | same names resolve locally |
| 35–40 | Parity check | Script compares Databricks vs DuckDB per table: row count, `SUM` of every `_cents`/`_usd` column, min/max of every timestamp, 20 sampled rows by key | all 31 tables PASS (result logged as a claim-style evidence row) |
| 40–45 | Proof of design | Run one silver SQL file (active machine-days + gaming date) on both engines and diff; create MLflow experiment `/Users/<you>/royale-tpah` and log a dummy run | identical output; run visible in UI |

**Fallback triggers** (D-007): auth not working at minute 15 → continue on DuckDB, retry at the next stage check-in. Upload blocked → upload through the Catalog UI by hand (Carson, ~5 min). Bronze SQL fails on a type → fix that table or land it as-is and cast in silver.

## Repo additions (proposed)
```
databricks/
  upload_volume.py      # push data/**/*.parquet to the Volume (idempotent)
  create_bronze.py      # generate + run bronze CTAS from manifest.json
  parity_check.py       # Databricks vs DuckDB comparison, writes docs/evidence/parity.md
sql/
  bronze_local.sql      # DuckDB views with the same names as the Delta tables
  silver/*.sql          # shared SQL (same text on both engines)
local/royale.duckdb     # git-ignored
```
Shared-SQL rules: reference tables as `<schema>.<table>` only (catalog set per session); use ANSI interval literals (`INTERVAL '6' HOUR`); avoid engine-specific time-zone functions (use the `_local` columns); no `QUALIFY`-only tricks without checking both engines.

## Not in this step (later stages)
Databricks Job / bundle orchestration, Lakeflow pipeline, UC model registry, Genie/AI-BI dashboard, the app's token and live-query layer (D-014), where model training runs (D-019).

# Stage B7 — The web app (plan)

Status: **ready to build.** Decided: D-039 PAT in `web/.env.local` (server only) · D-040 app in `web/` · D-041 verdict tags recompute for the selected period (point estimates on short periods, labelled) · D-042 first session = shell + live Verdict page. Already decided: D-022 Next.js on Vercel · D-008 live Databricks SQL · D-014 live only for now (fallback at deploy) · D-010 Burgundy velvet + Inter card numbers (`design/STYLE.md`) · D-021 scorecard side panel + `?machine=` link · D-038 Recharts + custom SVG · D-020/D-025 clickable scorecard with 30-day gain + peer context · D-023 auth on hold.

## Stack (toolchain checked 2026-11-07)
- **Next.js 16** (App Router, TypeScript, server components), Node 24 / npm 11.
- **Databricks:** `@databricks/sql` 3.x Node driver, server-side only (never in the browser); one module `lib/db.ts` with parameterized queries (no string-built SQL from user input); short server cache so judge clicks don't each wake the warehouse.
- **Charts:** Recharts 3 + hand-built SVG (floor map, rank tracks).
- **Styling:** CSS variables from `design/STYLE.md` + CSS modules (same approach as the mockup); fonts via `next/font` (Cormorant Garamond, Inter).
- **State in the URL:** every filter and the selected machine live in query params (`?from=&to=&zone=&bank=&group=&machine=`) → any view is shareable and judge test #1/#2/#4 work by link.

## Pages (judge tests in brackets)
| Route | Content | Reads |
|---|---|---|
| `/` Verdict | headline, 4 KPI cards with claim links, zone chart, manager's 10 with verdict chips, scorecard panel [trace a recommendation] | `machine_verdict`, `machine_metrics_full`, `machine_day` |
| `/machines` | all 310 ranked (D-024), sortable; floor map (slot x/y, colored by verdict); earning-rate vs luck-z scatter; replacement ranking with 30-day gain + peer context (D-025); scorecard panel [drill into a bank] | `machine_day`, `machine_day_peers`, `machine_q1_stats`, `machine_effect`, `floor_locations` |
| `/demand` (Q2) | daily coin-in with events + walkway-closure bands; weekday pattern; event-lift table with ranges; Back Forty before/during/after; zone traffic [change the period] | `floor_day`, `zone_day`, `event_uplift`, `walkway_periods` |
| `/downtime` (Q3) | monthly downtime and lost theo; staffing vs repair wait by shift; faults per 1,000 machine-days by maker | `downtime_machine_day`, `tech_shift_day`, `downtime_ticket` |
| `/players` (Q4) | tracked-only banner; ahead rate, concentration (Lorenz), group drill: tier / age / region / spend segment (protective framing) [drill into a guest group] | `player_month`, `player_dim` |
| `/comps` (Q5) | weekly points per comp $ with the Apr 28 change, reinvestment before/after by tier, visits flat | `comp_week`, `comp_tier_month`, `comp_change` |
| `/plan` (Q6) | the three funded actions + keep, cost formula, effect ranges, sensitivity, measurement plan, each linked to its claims [trace a recommendation] | `budget_*` (Stage B6 build, still pending) |
| `/model` | frozen-forecast diagram, MAE table vs both baselines with ranges, predicted vs actual, daily line, leakage test, Feb move check, MLflow run links [find how the model was validated] | `model_metrics`, `model_predictions`, `model_move_check` |
| `/evidence` | every claim: query file, result, alternative tested, limitation; deep links from every chart | `docs/claims.md` (parsed at build) |
| `/about` | data lineage (bronze → silver → gold on Databricks), parity results, AI-use disclosure | static + parity reports |

Every chart: caption, "Evidence: Cxx" link, hover tooltips, a table view toggle (accessibility), and a note when it ignores a filter (e.g. "model results are frozen Jan–Apr → May–Jun").

## How the filters work
- **Period** (presets: full window, Jan–Apr, May–Jun, each month, custom): recomputes every descriptive metric from the day-level gold tables with ratio-of-sums SQL.
- **Zone → bank → machine:** narrows tables, charts and the floor map.
- **Guest group** (tier / age / region / spend segment): Players and Comps pages.
- **Verdict tags** (D-041): the Q1 rules re-run in SQL for the selected period (D-006 lenient cutoffs). Full-window view also shows the bootstrap intervals; shorter periods show point estimates with a note, and "too little data" applies to <30 days on the floor inside the period.

## Build order
1. Scaffold `web/` (Next.js + TS), style tokens, layout shell (header, nav, filter row), `lib/db.ts` + a `SELECT 1` health check against the warehouse.
2. Verdict page end to end (live data, scorecard panel, URL state) → **first runnable app**.
3. Thin versions of all other pages (one table + one chart each) → **base version complete**.
4. Budget build (B6) and the Plan page.
5. Polish rounds: floor map, Lorenz, sensitivity, table views, mobile, accessibility pass.
6. Deploy (D-009, D-014 fallback revisit, D-023 auth revisit).

## Verification
`npm run build` clean; each page loads against live Databricks; the four judge tests walked in the Browser pane; numbers on each page spot-checked against `uv run python -m royale.claims`.

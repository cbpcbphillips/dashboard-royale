# Stage B4 — Q2–Q5 core metrics (plan)

Status: **built (2026-11-07 ~18:00).** Decided: D-026 simple event ratio now + model cross-check later · D-027 hour-of-day weighted lost play (Databricks SQL on `machine_hour`) · D-028 tier, age band, region, spend segment · D-029 before/after with tier-mix check. Goal for the base version: one solid table + chart per question, each tied back to the Q1 verdict, each with a claim.

## What the data already shows (profiling 2026-11-07, to verify as claims)
| Q | Signal | Number | Links to Q1 |
|---|---|---|---|
| Q2 | Floor demand is flat month to month | coin-in/day $1.32M–$1.41M; occupancy 0.35–0.38; avg bet $0.82–0.85 | Low earners aren't explained by a floor-wide slump |
| Q2 | Weekends drive demand | Sat $1.80M/day vs Tue $1.10M | Calendar control for the model |
| Q2 | Events lift coin-in | vs same weekday same month: Super Bowl +23%, Slot Tournament +18%, March basketball +18%, EDC +16%, Locals Week +8%, CES +2% | Promotion-weekend action (Q6) |
| Q2 | Back Forty gets ~1/7 the foot traffic | 18–26 entries per covered hour vs 78–184 in other zones; dips to 18.4 in March (walkway closed Mar 3–Apr 7) | Explains "Location" verdicts (C02) |
| Q3 | Downtime is small but peaks in Mar and May | 0.28–0.44% of scheduled hours; May 1,017 h vs June 630 h | Explains why no machine is tagged "Downtime"; Apr–May tech shortfall (C05) |
| Q4 | Most tracked players lose; losses are concentrated | 16.1% of carded players ended ahead; top 10% of players = 64% of theo and 75% of net loss; carded share of coin-in ~65% | Who plays Back Forty (drill) |
| Q5 | **Comp redemption got ~2× cheaper in points around Apr 28** | points per comp $ (face value): ~12.5 → ~5.8 within one week, flat after; comp cost / tracked theo 1.11% (Jan) → 1.32% (Jun) | Policy change → comp pilot / rate action (Q6) |
| Q5 | Slow drift before the step | 14.3 → 12.4 points per comp $ Jan–Apr | Tier mix or benefit mix? (competing explanation) |

## Metrics and tables (all shared SQL → gold, both engines)
**Q2 — demand** (`gold.property_day_ext`, `gold.zone_day`, `gold.event_uplift`)
- Daily floor: coin-in, occupancy `Σ occupied ÷ Σ available`, coin-in per available machine-hour, avg bet `Σ coin-in ÷ Σ spins`, carded share.
- Zone-day: same metrics + traffic `Σ entries ÷ (Σ coverage_minutes ÷ 60)` from `ok`/`partial` hours only; gaming date = `hour_start_local − 6 h`.
- Event uplift (D-026).
- Back Forty walkway difference-in-differences: (B40 during ÷ before) ÷ (rest during ÷ before), for occupancy, coin-in per hour and traffic; plus after-reopening recovery.

**Q3 — downtime** (`gold.downtime_ticket`, `gold.downtime_month`)
- Downtime hours `Σ (scheduled − available)` by month / zone / manufacturer / cause (`operations.event_type`).
- Ticket timing: wait = work started − opened; repair = available − work started.
- Faults per 1,000 active machine-days by manufacturer (exposure-adjusted).
- Lost play valuation (D-027).
- Staffing: slot-tech actual ÷ planned headcount by shift × month vs average wait.

**Q4 — tracked players** (`gold.player_summary`, `gold.player_group`) — always labeled "tracked (carded) play"
- Aggregate `player_period` to player over the selected period **first**, then: coin-in, payout, net = payout − coin-in, theo, luck = net + theo.
- Ahead rate, concentration (top 1% / 10% share of theo and net loss, Lorenz + Gini), by group (D-028).
- Coverage: carded share of coin-in from machine meters.
- Responsible framing: no targeting of heavy losers; protective observations only.

**Q5 — comps** (`gold.comp_week`, `gold.comp_tier_month`)
- Comp economic cost (inside POS cogs; subtract once), face value shown separately (not revenue).
- Reinvestment = comp cost ÷ carded theo, by month and tier.
- Redemption rate = points redeemed ÷ comp face $ by week; earn rate = points earned ÷ theo $.
- Change-point and its effect (D-029).

## Claims to add
C05 tech shortfall ↔ wait (re-verify), C06 Ridgeline fault rate (re-verify), C07 comp rate step (rewrite with the Apr 28 finding), C08 floor luck (Feb), C10 event uplift, C11 Back Forty traffic + walkway DiD, C12 downtime cost, C13 player concentration.

## Steps
1. Shared SQL in `sql/gold/1x_*.sql` (Q2), `2x_*` (Q3), `3x_*` (Q4), `4x_*` (Q5); run on both engines; parity check.
2. Big-table aggregations (`machine_hour`, `sessions`, `loyalty_ledger`) run on Databricks SQL as the primary engine (D-007 story), DuckDB for parity.
3. Claims SQL + `docs/claims.md`; validation (player totals reconcile with `machine_day.carded_*`; comp cost reconciles between `property_day`, `player_period` and `loyalty_ledger`).

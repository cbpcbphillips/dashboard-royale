# Stage B8 — 1-year replacement model for Q1 (plan)

Status: **design mostly decided; D-055 (lifespan) open.** Replacement = new unit of the same type in the same spot (D-048b); contract costs as own line (D-051); configured take, leaks flagged (D-052); all days on the floor (D-053); ranking = chronic % shortfall within type (D-054). See DECISIONS.md for the evidence that led here. Decided: D-045 our 10 = most profitable replacements over a year · D-047 cost = cheaper of lease/buy ($22,000 purchase) + install downtime · D-048 replacement keeps its own configured hold, floor average (~9.46%) when unknown · D-044 plain English on the page.

## Question it answers
"If we swapped this machine for an average one in the same spot, how much more (or less) would the casino make over the next year, after paying for the swap?" The 10 highest = our 10 truly underperforming machines.

## Design
Two parts, both already supported by the gold tables:
1. **Demand (play per open hour)**: the existing exposure-weighted GLM on coin-in per available hour, with spot factors (bank, zone, calendar, events, walkway closure) and machine factors (game, maker, lease class) plus the shrunk machine effect.
2. **Take per dollar (hold)**: current machine = its configured hold (D-052 below); replacement = floor-average configured hold (D-048).

For each machine on the floor on Jun 30:
- **As is, per year** = predicted coin-in per open hour (its own game, maker, machine effect, in its spot) × its hold × its open hours per year.
- **Average machine in the same spot, per year** = predicted coin-in per open hour with machine factors set to the floor's average mix (spot and calendar unchanged; machine effect 1.0) × floor-average hold × floor-average open hours per year (so a fault-prone maker's downtime counts against it).
- **1-year gain** = average − as is − $22,000 − install downtime (6 h at the current rate) [− running-cost difference if D-051 says so].
- Range: low/high from the machine-effect interval and the model's validation error.
- A year = the daily rates × 365 (D-053 sets which months to scale from).

## Validation (honest, time-based)
- **Time split** (as before): fit Jan–Apr, predict May–Jun coin-in per open hour; compare with both baselines (zone × game average, machine's own history).
- **"What would a new machine earn here?" test**: 10 machines were installed during the window (M-1532 Feb 25; 8 Aurora Link machines Mar 24; M-5076 May 13). Fit only on data before each install, predict the newcomer's first weeks from its spot and an average machine, compare with what it actually did. This directly tests the counterfactual the ranking relies on.
- **Real moves** (C16): the model already predicted M-1152's move out of Back Forty at 1.90× vs 2.12× actual.
- MLflow runs + Unity Catalog model, gold table `machine_replacement_1yr`, claims for the top 10 and the validation.

## What the rough numbers already show (2026-11-07)
- Floor-average take is 9.46% per dollar; floor-average uptime 99.6%.
- With D-048, 75 of 308 machines clear $22k in a year; **67 of the 75 run the three most generous games** (G-VID95 keeps 5%, G-HIGH92 / G-LOW92 keep 8%). The top 10 are almost all G-VID95, played about as much as their neighbours, gaining ~$55–65k/yr each purely from the higher take.
- In this data, more generous games do **not** draw clearly more play (coin-in per open hour for 5%-keep games ≈ 213 vs 205–211 for 11–12%-keep games in the same zones), so the "players won't react" assumption is at least not contradicted. Worth a claim.
- Demand-only view (same take, average play) finds very different machines (e.g. M-1044, M-1139, M-1155), with only ~5 clearing $22k.
- Running costs differ a lot by contract: revenue-share leases cost ~$127/day (~$46k/yr) vs ~$15/day owned; replacing a revenue-share machine with a purchased one saves ~$40k/yr regardless of how it plays.

## Open decisions
- **D-050** How to present the ranking given the generous-games effect.
- **D-051** Include running-cost differences (lease, revenue share, service, repairs)?
- **D-052** Current machine's take: configured or actual (matters for M-1158, which keeps 3.0% vs 10% configured)?
- **D-053** Which months to scale a year from.

# Stage B3 — Q1: which machines are truly underperforming? (plan)

Status: **built (2026-11-07 ~17:00).** Lenient cutoffs (D-006), demand-based replacement score (D-025a). Decided: D-013 bank-mates + zone on occupancy & CPAH · D-024 all 310 machines tagged · D-025 expected 30-day gain + peer context. D-006 cutoffs chosen after a preview of the distributions.

## Data cleaning: what was needed before Databricks
Nothing was changed before import, on purpose. **Bronze = the files exactly as released** (checksums in each table comment) so every number traces back to the source. Cleaning rules live in **silver** SQL, where they are visible and run identically on both engines.

Checks already done (2026-11-07):
| Check | Result | Handling |
|---|---|---|
| Organizer semantic checks (keys, window, accounting, rollups, lags, DST) | 11/11 PASS | — |
| Checksums vs manifest | 62/62 match | — |
| Off-floor rows | 1,018 | dropped in silver (`active AND location_id IS NOT NULL`) |
| available > scheduled, occupied > available, play while down | 0 / 0 / 0 | none needed |
| Zero-play active days | 17 | real (zero is valid) |
| Negative house-win days | 7,117 | real (luck), never "fixed" |
| Theo ÷ coin-in vs (1 − RTP) per game | exact (gap 6e-17) | theo is trustworthy as the luck-free benchmark |
| Machines that changed game | 0 | — |
| Machines that moved | 4 (M-1299, M-1126, M-1113, M-1152) | location taken per day |
| Cents vs dollars, DST, gaming day | — | handled in `sql/silver/machine_day_active.sql` |

**Correction to an early signal:** Back Forty is *not* heavy in the 95%-RTP game (G-VID95 is 5 of ~49 machines there). Its mix looks like other zones (mostly G-PEN89, G-STD90), and 8 of 10 games appear in 5+ zones, so same-game comparisons across zones are feasible. Game mix is now a weaker competing explanation; we still test it formally.

**Observation worth a claim:** M-1120 (bank B-38) was retired May 13 and M-5076 was installed the same day in the same bank; both are in the manager's bottom 10. A *new* machine in the same spot also earned little, which points at the spot.

## Outputs
1. `gold.machine_day` — silver plus zone/bank/config labels; the app filters it by the chosen period (all Q1 metrics recompute for any date range).
2. `gold.machine_metrics_full` — one row per machine for Jan 1–Jun 30 (default view, verdict input).
3. `gold.peer_metrics` — for each machine: same bank excluding itself, zone, same game floor-wide, same game in zone.
4. `gold.machine_verdict` — tag, reasons, evidence numbers, claim IDs; feeds the scorecard (D-020/D-021).
5. Claims C01–C04 as `sql/claims/Cxx.sql`.

## Metrics (all ratio of sums over the chosen period)
| Metric | Formula |
|---|---|
| Days on floor | count of active days |
| Availability | Σ available_hours ÷ Σ scheduled_hours |
| Occupancy | Σ occupied_hours ÷ Σ available_hours |
| TPAH (earning rate) | Σ theo_usd ÷ Σ available_hours |
| CPAH (demand) | Σ coin_in_usd ÷ Σ available_hours |
| House win / avail-hr | Σ house_win_usd ÷ Σ available_hours |
| Observed vs configured hold | Σ house_win ÷ Σ coin_in vs Σ theo ÷ Σ coin_in |
| Luck residual, SD, z | Σ(house_win − theo); √Σ luck_var_cents2 ÷ 100; residual ÷ SD |
| vs bank-mates (D-013) | machine occupancy ÷ bank-mates' occupancy; same for CPAH (bank-mates exclude the machine) |
| vs same game | machine TPAH ÷ same-config TPAH (floor-wide, and within zone where ≥3 peers) |
| Zone / bank effect | zone (bank) TPAH ÷ floor TPAH |
| Contribution per day | Σ contribution_after_supplied_costs_usd ÷ days (actual); expected version uses theo |
| Uncertainty | 95% interval for each ratio from a bootstrap over days (resample days, recompute ratio of sums) |

## Verdict rules (draft; thresholds are D-006)
Applied in order; each machine gets one primary tag plus any secondary flags.
1. **Too little data** — fewer than *N* days on floor (M-5076: 49, M-1118: 55).
2. **Leak → inspect** — luck z ≤ *−3.7* (310 machines, Bonferroni α = 0.05); **watch** if −3.7 < z ≤ −2.5. Wording: "a lead to inspect, not proof."
3. **Downtime** — availability below *X%* (no machine is below 98% lifetime, so expect none; downtime story is by period, Q3).
4. **Location** — bank or zone earning rate in the bottom quartile **and** the machine is within ±*Y%* of its bank-mates on occupancy and CPAH.
5. **Machine / game** — occupancy or CPAH more than *Y%* below bank-mates **and** below same-game peers, interval excludes parity → replacement candidate.
6. **Luck** — low total house win but earning rate normal and |z| small → keep.
7. Otherwise **OK**.
In the base version, rules 4–5 use peer comparisons; Stage B5 adds the model's machine effect as a second opinion.

## Validation
- Reproduce the manager's bottom 10 exactly with the guide's query.
- Silver totals reconcile with `prepared_daily_view` (house win, theo, coin-in, available hours).
- Luck z across 310 machines ≈ standard normal (QQ plot); a big departure would mean the SD formula is wrong.
- Spot-check 3 machines by hand.
- Everything runs on DuckDB and Databricks; parity check on gold.

## Steps
1. `sql/gold/machine_day.sql`, `machine_metrics_full.sql`, `peer_metrics.sql` (shared SQL).
2. Bootstrap intervals + verdict in Python (`royale/q1_verdict.py`), writes `gold.machine_verdict` to both engines.
3. Claims C01–C04 SQL + update `docs/claims.md`.
4. Validation checks above; parity on gold.

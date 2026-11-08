# Stage B5 — Model: expected earning rate per machine (plan)

Status: **built (2026-11-07 ~19:00).** D-032 bank terms = neighbour effect; D-033 bias reported as is. Decided: D-015 frozen forecast only in base · D-019 train locally, log to Databricks MLflow, register in UC · D-030 GLM + credibility-shrunk machine effect · D-031 moves only to zones where the game already runs. Already decided: D-002 targets TPAH and CPAH + neighbour context · D-003 exposure-weighted Tweedie/Poisson GLM now, GBM challenger later · D-004 frozen-at-Apr-30 forecast primary, 1-day-ahead secondary · D-005 baselines = zone × game average and machine persistence · D-013 neighbours = bank-mates (excl. self) + zone · D-026 model cross-check of event lift.

## The question the model answers
"What should this machine earn per available hour **in this spot**, and what would it earn **somewhere else**?" Its output changes the July 1 call for each candidate machine:
- **Keep** — the machine earns what the model expects for its game in its spot.
- **Replace** — the machine earns clearly less than the model expects for its game in its spot (machine effect < 1, interval excludes 1) and a replacement pays back.
- **Move** — the machine itself is fine, but the same game would earn enough more in another spot to cover the $1,800 move inside the window.
- **Inspect** — actual house win far below theo (luck test from Q1; not a model output).

## What the data says before modeling (2026-11-07)
| Fact | Number | Implication |
|---|---|---|
| Split sizes | train Jan–Apr 36,304 machine-days, test May–Jun 18,788 (309 machines each) | enough data |
| Machine rates are very stable | Jan–Apr vs May–Jun TPAH correlation 0.985; persistence error $1.06/h on a $17.39 mean (~6%) | **persistence will be a hard baseline to beat** at the period level; the model must earn its keep on calendar effects, moved/new machines and counterfactuals |
| Floor got slightly quieter | TPAH $18.13 (train) → $17.39 (test), −4% | a frozen forecast can't see this; it shows up as bias, which we report |
| New machine in test | M-5076 (installed May 13, Back Forty) has no training history | model predicts from zone × game; persistence can't |
| Moves | M-1152 Back Forty → Main Entrance (Feb 4), M-1113 (Feb 18), M-1126 (May 6), M-1299 (Jun 10, → Hotel Corridor) | 2 moves inside the test window = honest test of location effects; M-1152 is a natural experiment for "move out of Back Forty" |
| Daily noise | daily TPAH SD $7.84 on a $17.88 mean | day-level MAE will be large for every method; period level is the decision level |

## Design
**Grain & target:** machine × gaming day (active, available hours > 0). Target = rate (TPAH; separately CPAH), fitted with `sample_weight = available_hours` and a log link (equivalent to a Poisson/Tweedie model with an exposure offset).

**Frozen forecast (primary, D-004):** fit on Jan 1–Apr 30, predict every May 1–Jun 30 machine-day using only what was known on Apr 30:
- zone, bank, game (config), volatility, RTP, manufacturer, lease class (all known);
- weekday / weekend / federal holiday (calendar);
- events with `announced_date ≤ 2025-04-30` (EDC yes; Locals Week, announced May 26, **no**);
- walkway-closure flag (only active in training; 0 in test);
- bank-mates' Jan–Apr occupancy and CPAH excluding the machine (D-013), computed from training rows only;
- machine effect (D-030), estimated from training rows only; machines without history get 1.0.
No `lag_*` columns, no LVCVA/survey data, nothing from May–Jun.

**1-day-ahead (secondary, D-004/D-015):** same model plus the `lag_*` columns (prior 7/28 days), predicting each test day from the days before it.

**Baselines (D-005):** (a) zone × game Jan–Apr ratio of sums (fallback game → floor); (b) machine's own Jan–Apr rate (fallback = baseline a).

**Metrics:** MAE in $/available hour at **machine-period** (May–Jun ratio of sums per machine; the decision level, primary) and machine-day (secondary); bias (mean error); MAE on the moved/new machines separately; 95% interval for "model MAE − baseline MAE" from a bootstrap over machines. Reported honestly whatever wins.

**Leakage test:** rebuild all features with every May–Jun row deleted → predictions must be identical.

**Decision use:**
1. Machine effect with interval → confirms or overturns the Q1 "Machine/game" tags (agreement table).
2. Move counterfactual (D-031): predicted rate of the same game in other spots × hours × days left after lead − move cost.
3. Validate the counterfactual on the real moves (M-1152, M-1113): did predicted change match actual change?
4. Refit on Jan–Jun for the July numbers used in the budget (Stage B6).

**MLflow (D-019):** one experiment `royale-tpah`; runs: baseline-zone-game, baseline-persistence, glm-frozen (TPAH, CPAH), glm-1day (if in scope); params, split dates, feature list, data manifest SHA, all metrics, plots (pred vs actual, residuals by zone), coefficient table; final July model registered in Unity Catalog.

## Outputs
`gold.model_predictions` (machine-day: actual, each method's prediction), `gold.model_metrics`, `gold.machine_effect`, `gold.move_counterfactual`; claims C14 (validation result), C15 (model vs Q1 verdict agreement), C16 (move counterfactual + natural experiment).

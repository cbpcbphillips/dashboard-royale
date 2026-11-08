# Stage B6 — The $100,000 plan (July 1–30, 2025) (plan)

Status: **built** (`royale/budget.py`, `/plan`). **Superseded by D-083: 2 promotion weekends + inspect M-1158 + Back Forty wayfinding = $38,724.** Earlier: Decided (D-012, D-034–D-037): **1 promotion weekend ($15,000, valued at the smaller past promo) + inspect M-1158 ($1,200) + Back Forty wayfinding ($7,500) = $23,700; keep $76,300.**

Rules (GUIDE §6): ≤3 action types; units ≤ `quantity_limit`; cost = `qty × (unit_cost + daily × max(0, 30 − lead)) / 100`; benefit only for the `30 − lead` days left; machine downtime counted as lost theo; no conflicting `same_machine` actions on one machine; comp pilot and comp change are exclusive; keeping money is valid.

Valuation convention: benefits are **expected house win (theo)**, not actual win (luck excluded). Low / mid / high scenarios; mid is what we'd defend.

## What the analysis found → what each fix would be
| Cause (evidence) | Fix in the catalog |
|---|---|
| **Leak?** M-1158 holds 3.0% vs 10% configured, luck z −4.57 (C03); its demand is normal (C15) | A-INSPECT |
| **Location** Back Forty earns ~half per hour for the same game (C02); players go there ~¼ as often (C11); a real move doubled a machine's rate (C16) | A-WAYFINDING (zone), A-MOVE-MACHINE (into empty slots), A-MOVE-BANK (swaps) |
| **Downtime** small: ~$102k theo over 6 months (C12); waits double when techs are short (C05); Ridgeline faults 2.4–3.6× (C06) | A-TECH-SHIFT, A-PREVENTIVE |
| **Comps** 2× cheaper in points since Apr 28, +12% cost per $ theo, visits flat (C07) | A-COMP-CHANGE, A-COMP-PILOT |
| **Demand** events lift coin-in; the casino's own promos +7.5% (Locals Week, 7 days) and +17.3% (Slot Tournament, 3 days); no pull-forward seen in the 7 days before/after (C10) | A-PROMO |
| **Machine** replacement never pays back in 30 days (C09); machine effects ≤3% (C15) | A-REPLACE-* → not funded |

## Pricing (preliminary, 30-day window)
| Action | Units / target | Cost | Benefit days | Expected effect (low / **mid** / high) | Net (mid) | Read |
|---|---|---:|---:|---|---:|---|
| A-PROMO | 1 weekend (Jul 18–20 or 25–27) | $15,000 | event days after 14-day lead | extra theo **$64.8k** (Locals Week size) / **$71k** (avg) / $77.8k (Tournament size); low case if July demand is softer: ~$30k | **≈ +$50k** | Best value by far; check summer softness (May–Jun ran ~5–6% below forecast) |
| A-PROMO | 2nd weekend | +$15,000 | | unknown diminishing return; assume 50–100% of the first | +$17k to +$56k | Riskier: back-to-back promos untested |
| A-INSPECT | M-1158 | $1,200 | 29 | if paytable/meter fault: 7% hold gap × $2,871 coin-in/day ≈ **$201/day → $5.8k**; 2 h downtime ≈ $15 | ≈ **+$4.6k** if fault (P high: p = 0.0008 for luck) | Cheap, directly answers the "leak" question |
| A-INSPECT | + watch list (z ≤ −2.4, 3 machines) | $1,200 each | 29 | mostly luck (11 machines at z ≤ −2 vs 7 expected) | ≈ −$1k each | Information only |
| A-MOVE-MACHINE | 3 Back Forty machines → the 3 empty non-Back-Forty slots (Center Pit ×2, Hotel ×1) | $5,400 | 28 | gross what-if $3.8k–$6.2k each (C16 model, 1.5–1.7×); **if only 25 / 50 / 100% of that play is new** (rest taken from neighbours) | ≈ **+$2.4k** (50%) | Only feasible one-way moves; Main Entrance has no empty slot |
| A-WAYFINDING | Back Forty | $7,500 | 20 | Back Forty theo $12,952/day; break-even = **+2.9%**; traffic → occupancy elasticity ≈ 0.9 (closure DiD); scenarios 0% / **+5%** / +10% | ≈ **+$5.5k** (wide: −$7.5k to +$18.4k) | Treats the actual cause; no direct evidence on signage effect |
| A-MOVE-BANK | swap a Back Forty bank with a busier one | $9,500 per bank (2 for a swap) | 25 | model: near zero-sum (location effect moves with the slot, not the machine); gains only from putting higher-demand games in busier spots | likely < cost | Not recommended |
| A-COMP-CHANGE | restore ~13 points per comp $ | $1,500 | 27 | saves 0.14 pp of tracked theo ≈ $3.6k/month → **$3.2k**; risk: visits drop (evidence: visits didn't rise when it got cheaper) | ≈ **+$1.7k** | Small but reverses an unexplained cost rise |
| A-COMP-PILOT | half of card holders on ~13 pts, half control | $4,000 | 25 | ≈ half the savings ($1.5k) + a causal answer | ≈ −$2.5k (info value) | Better evidence, costs more |
| A-TECH-SHIFT | grave shift (waits 1.96 h avg) | $11,520 | 23 | all fault waiting over 6 months ≈ 1,378 h × $20.37 ≈ $28k → **max ~$3.4k** in 23 days | ≈ **−$8k** | Not worth it unless the Apr–May shortage returns |
| A-PREVENTIVE | Ridgeline | $9,000 | 23 | Ridgeline fault downtime $7–11k theo/month; 30% fewer faults ≈ $2.5k; minus 141 h PM downtime | ≈ **−$8k** | Long-run maybe; not in 30 days |
| A-SURVEY | 1 month | $3,500 | 23 | information on why guests skip Back Forty | −$3.5k | Information only |
| A-REPLACE-LEASE / BUY | any | $3,380 / $22,000 | 16 / 9 | none pays back (C09) | < 0 | Not funded |
| A-HOLD | remainder | $0 | | | | Valid |

## Measurement plan (per funded action, pre-registered before July 1)
- **Promo:** event-day coin-in ÷ same-weekday baseline (C10 method), plus the 7 days before/after for pull-forward; compare with the +7.5% / +17.3% history.
- **Inspection:** finding (paytable, meter, nothing); if fixed, M-1158 hold vs theo over the next 30 days inside its luck band.
- **Moves / wayfinding:** Back Forty vs rest-of-floor difference-in-differences on occupancy, coin-in per hour and traffic (C11 method), 30 days before vs after; moved machines vs model prediction.
- **Comps:** points per comp $, comp cost ÷ tracked theo, visits per player-month; for the pilot, treatment vs control.

## Build steps (after decisions)
1. `royale/budget.py`: catalog-driven cost formula, scenario benefits from gold tables, constraint checks (≤3 types, limits, incompatibilities), sensitivity (tornado over the key assumptions).
2. `gold.budget_actions`, `gold.budget_portfolio`, `gold.budget_sensitivity` on both engines.
3. Claims C17+ for each funded action; D-012 recorded.

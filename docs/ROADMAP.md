# Roadmap (after the 2026-11-07 direction reset)

Goal: answer the six questions plainly for a non-technical executive (D-044), and make the four judge tests effortless. Analysis stays rigorous; the math sits behind "How we worked this out" on each card.

## App structure (D-043)
| Tab | Answers | Starts with (guide) | Goes deeper with | Judge test |
|---|---|---|---|---|
| **Overview** (home) | each of the six questions in one sentence + "see why" | — | — | trace a recommendation |
| **Q1 Machines** | which machines are truly underperforming | prepared_daily_view | machine_day, game_math, placements | change period · drill into a bank |
| **Q2 Demand** | what changed in demand, and why | property_day, zone_traffic_hourly | events, real_sources | change period |
| **Q3 Downtime** | how much play was lost to downtime, and when | prepared_daily_view (availability) | operations, shift_roster | drill into a bank |
| **Q4 Players** | what tracked players wagered, got back and netted; concentration | player_period | sessions, trips | drill into a guest group |
| **Q5 Comps** | what comps cost; what changed | player_period, property_day | loyalty_ledger, fnb_transactions | drill into a guest group |
| **Q6 Plan** | which actions we'd fund with $100k; how we'd know they worked | action_catalog, cost_rules | everything above | trace a recommendation |
| **How we checked** | model validation, evidence for every number | model tables, claims | — | find the model validation |

Filters: period on every tab, with a warning on short windows (D-046); bank on Q1–Q3; guest group on Q4–Q5. Shareable URLs throughout.

## To do (in order)
Working rule (2026-11-08): get every question to a good baseline first; polish comes after deployment.
1. ~~Q1~~ done: `/machines`, plan of record `docs/Q1.md`, claims C17–C20.
2. **Q2–Q5 tabs:** one plain answer, 2–3 simple charts each, period filter where cheap, links to claims (C05–C13), built on the gold tables.
3. **Q6 Plan tab:** draft ≤3 actions within $100k for Carson to decide (candidates: inspect M-1158, Ridgeline preventive maintenance, Back Forty wayfinding, promotion weekend); costs, effect ranges, measurement plan, each linked to evidence.
4. **Overview page:** six one-sentence answers with "see why" links.
5. **How we checked tab:** model validation in plain words (C14–C16) above the claims list (built).
6. **Deploy (D-009), Devpost write-up, video, AI disclosure.**
7. **After deployment: clean up imperfections** (only if time allows), e.g.:
   - Q1 quiet-spot label on banks only slightly below the floor (Bar Row B-21/B-24, Hotel B-40/B-41 at 90–98%).
   - Older claims still say "Used in: Verdict" (page removed).
   - Visual polish and wording passes on every tab.

## Open items
- D-009 public repo & host (before first deploy).
- D-023 user authentication (on hold until organizers clarify "public").
- How the manager's original list appears, if at all (Q1 now answers the question directly).

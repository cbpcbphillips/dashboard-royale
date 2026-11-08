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
Done: all six pages, Summary, Evidence with model checks, cost analysis (D-083), staff sign-in with judge access (D-084), deploy (https://dashboard-royale.vercel.app), fixes from the judge-style review.
Done (D-086): remediation plan A–S from the rubric grade (slowdown explained, out-of-sample ranking check, profit-based July plan, forecast yardstick and staffing check, challenger model, More findings tab, hero charts, glossary, README, tests + CI, accessibility pass). Done: D-090/D-091 (signs dropped; mix = 2 promotions + inspect M-1158). Open: usability test with 1–2 non-technical readers (script in `local/USABILITY_TEST.md`).
1. **Push the review fixes** (Carson commits); re-check the live site.
2. **Venue network check:** open the live link off Wi-Fi (phone); if the venue's Cisco Umbrella filter blocks it, ask organizers to allow the domain.
3. **Claims for the remaining page numbers:** the July plan cost analysis (budget.py results) and Summary-only figures, so every number in the write-up/video has a claim.
4. **After deployment: clean up imperfections** (only if time allows):
   - Visual polish and wording passes on every tab (reviewers may find Summary and drill-downs text-heavy; more charts, fewer words).
   - Header crowds at narrow widths now that the sign-in chip is there.
5. **Final submission (when Carson says):** ≤400-word write-up, ≤2-minute video, Claims & Evidence appendix (from `docs/claims.md`), AI disclosure (`docs/AI_USE.md`), Devpost form; private-window test of the four judge tests.

## Open items
- D-009 public repo & host (before first deploy).
- D-023 user authentication (on hold until organizers clarify "public").
- How the manager's original list appears, if at all (Q1 now answers the question directly).

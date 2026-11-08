# AI-use disclosure (running log)

Required by the Devpost submission. Updated as we go; summarized in the appendix at submission time.

**Tool:** Claude Code (Anthropic, model Claude Opus 5.5) in the Claude desktop app.

**Ground rules we follow:** the human (Carson Phillips) makes every analytical and design decision (see `docs/DECISIONS.md`); AI output is reviewed before use; every number shown to judges is traceable to a re-runnable query in `docs/claims.md`.

| Date/time (CST) | What the AI did | Human role |
|---|---|---|
| 2026-11-07 ~13:45 | Read GUIDE.md and the reference docs; read-only data profiling (bottom-10 list, zone theo per hour, luck z-scores, repair tickets, staffing, comps) to ground the plan | Asked for a plan only; reviewed findings |
| 2026-11-07 ~14:00 | Drafted the end-to-end process plan (metrics, model, budget, Databricks, dashboard, schedule) with options per decision | Answered clarifying questions; approved the plan |
| 2026-11-07 ~14:05 | Created `docs/DECISIONS.md`, `docs/claims.md`, this file; scaffolded the uv project | Decisions remain open until Carson decides |
| 2026-11-07 ~14:30–18:00 | Wrote and ran the Databricks setup scripts, shared SQL (bronze/silver/gold), Q1–Q5 metrics, bootstrap intervals, validation and parity checks; drafted claim text from query results | Chose every method and cutoff (D-001–D-029); reviewed previews before cutoffs were set |
| 2026-11-07 ~18:15–19:00 | Wrote and ran the model (GLM + shrunk machine effects), baselines, leakage test, move what-ifs, MLflow logging and UC registration; drafted claims C14–C16 | Chose model design (D-030, D-031), fixed the neighbour-term collision (D-032) and bias reporting (D-033) |
| 2026-11-07 ~20:00–21:15 | Built 12 style mockups; scaffolded the Next.js app and wrote the Verdict page, data layer, verdict rules and filters | Chose the style (Burgundy velvet + Inter card numbers) and all app decisions (D-039–D-042); creates the Databricks token personally |
| 2026-11-08 ~00:00–02:30 | Co-planned Q1 with Carson (questions, quick data checks), then built it: leave-one-out model, Python reference, app calculations, data export, Q1 page and floor map; verified app vs Python | Made every Q1 design decision (D-060–D-079); reviews D-080 |

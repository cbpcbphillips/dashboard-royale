# The Gilded Ace: luck, location, or a leak?

A TAMU Datathon **Dashboard Royale** entry. The general manager of a fictional 300-machine casino wants to replace the 10 machines that earned the least from January to June 2025. This project tests whether that's right and answers the six questions in the [participant guide](GUIDE.md).

**Live dashboard:** https://www.gildedacecasino.biz (also https://dashboard-royale.vercel.app). Click **Judge / demo access** for one-click, read-only access.

Fictional casino; synthetic data calibrated to public aggregates. Weather is from NOAA (public domain).

## The answer in brief
- **The manager's list is mostly a location problem, not bad machines.** Only one of the 10 (M-1158) is a machine problem: it pays out too much, so inspect it. The rest sit in a quiet zone (Back Forty) or were on the floor only part of the time.
- **13 machines truly get less play** than identical machines in the same kind of spot. That's proven over six months, and checked out of sample: machines flagged on January–April were all still low in May–June.
- **The July plan** funds two promotion weekends and an inspection of M-1158: $31,224 of the $100,000, about +$21k expected profit (worst case +$137). Of the top mixes among all 353 allowed, it's the only one that can't lose money in July. Back Forty signs were tested and dropped, because most of their play would be moved from other zones. Every funded action has a pre-written success line.

## What each tab answers
| Tab | Question |
|---|---|
| Summary | The manager's list re-examined, plus six findings |
| Machines | Which machines are truly underperforming, after exposure, availability and luck? |
| Demand | What changed in demand, and why (the May–June slowdown is fewer visitors) |
| Downtime | How much play was lost to downtime, and when |
| Players | What tracked players wagered, got back and netted; how concentrated |
| Comps | What comps cost and what changed (the Apr 28 points-price cut) |
| July plan | Which actions to fund with $100,000, and how we'd know they worked |
| More findings | Five more findings from a systematic scan |
| Evidence | How the model was tested, how it's built on Databricks, the data checks, and every claim with a re-runnable query |

## How it's built
1. **Source files → Databricks.** The organizer's 62 Parquet files are checked against the release manifest, uploaded to a Unity Catalog Volume, and loaded as Delta tables (`royale.bronze`) → `royale.silver` → `royale.gold`.
2. **Shared SQL** (`sql/bronze|silver|gold/*.sql`) runs on a Databricks SQL warehouse and on a local DuckDB mirror. `royale/parity_check.py` proves the two match, column by column (`docs/evidence/parity_*.md`).
3. **Models** (`royale/model*.py`, `royale/q1_loo.py`) are logged to MLflow (experiment `royale-tpah`), and the forecasting model is registered in Unity Catalog as `royale.gold.tpah_glm`.
4. **The site** (`web/`, Next.js on Vercel) reads small files exported from the gold tables by `royale/export_app.py`. It makes no live queries and holds no keys.

## Re-run it
Requires Python with [uv](https://docs.astral.sh/uv/) and Node 24+ (the web tests run TypeScript directly). The organizer data is **not** in this repo; get it from the [organizer release](https://github.com/tamu-datathon-org/dashboard-royale) and put it in `data/`.

```bash
uv sync
uv run python -m royale.claims            # every claim's query on DuckDB (add --engine databricks)
uv run python -m royale.q1_reference      # the machine ranking in Python
uv run python -m royale.q1_claims         # label counts and the short-period check
uv run python -m royale.q2_dip            # why the floor got quieter after April
uv run python -m royale.q1_persistence    # does the ranking hold out of sample?
uv run python -m royale.floor_forecast    # whole-floor forecast and the staffing check
uv run python -m royale.findings_scan     # the five extra findings
uv run python -m royale.budget            # the July cost analysis (all 353 mixes)
uv run python -m royale.export_app        # export the gold tables for the site
cd web && npm install && npm test && npm run dev
```

Scripts that write gold tables also write them to Databricks; add `--no-databricks` to run on the local DuckDB mirror only.

The app-vs-Python check (`royale/q1_check_app.py`) needs a session cookie, because the site is staff-only: set `GILDED_SESSION` to a judge-access cookie.

## Repo map
| Path | What's there |
|---|---|
| `royale/` | Python: Databricks setup, models, tests, cost analysis, exports |
| `sql/` | Shared SQL by layer; `sql/claims/` has one query per claim |
| `web/` | The dashboard (Next.js) |
| `docs/claims.md` | Claims & Evidence appendix |
| `docs/DECISIONS.md` | Decision log |
| `docs/AI_USE.md` | AI-use disclosure |
| `docs/evidence/` | Parity and validation reports |
| `GUIDE.md` | The organizer's participant guide |

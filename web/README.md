# The Gilded Ace dashboard (Next.js)

The staff-only dashboard for the Dashboard Royale entry; see the [project README](../README.md) for what it answers and how the data is built.

```bash
npm install
cp .env.example .env.local   # then fill AUTH_SECRET and STAFF_ACCOUNTS: node scripts/add-staff.mjs
npm run dev                  # http://localhost:3000, then use "Judge / demo access"
npm test                     # unit tests (stats, sign-in redirect guard, URL filters)
npm run lint && npx tsc --noEmit && npm run build
```

- **Data:** `data/*.json`, exported from the Databricks gold tables by `royale/export_app.py`, `royale/budget.py` and `royale/claims.py --export`. Read from disk on the server only.
- **Pages:** `app/` (Summary, Machines, Demand, Downtime, Players, Comps, July plan, More findings, Evidence) and `app/login`. `proxy.ts` gates every page and `/api/*` behind a signed session cookie (`lib/session.ts`).
- **Calculations:** `lib/q1.ts` re-implements `royale/q1_reference.py` (checked by `royale/q1_check_app.py`); `lib/stats.ts` has the statistics.

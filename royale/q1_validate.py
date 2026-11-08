"""Q1 validation checks -> docs/evidence/q1_validation.md (DuckDB, local files).

1. Our manager ranking reproduces the guide's "bottom 10" query exactly.
2. Gold machine-day totals reconcile with prepared_daily_view and property_day.
3. Luck z across machines looks standard normal (if the SD formula were wrong, it wouldn't).
Run: uv run python -m royale.q1_validate
"""
import datetime as dt
import math

import duckdb
import numpy as np
from scipy import stats

from royale import targets


def main():
    t = targets.load()
    b, g = t["bronze"], t["gold"]
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    lines, ok = [], True

    guide = [r[0] for r in con.execute(f"""
        SELECT machine_id FROM {b}.prepared_daily_view WHERE active
        GROUP BY machine_id ORDER BY SUM(house_win_usd) LIMIT 10""").fetchall()]
    ours = [r[0] for r in con.execute(
        f"SELECT machine_id FROM {g}.machine_metrics_full WHERE in_manager_bottom10 ORDER BY manager_rank").fetchall()]
    same = guide == ours
    ok &= same
    lines += ["## 1. Manager's bottom 10 reproduced", "",
              f"Guide query: {', '.join(guide)}", "", f"Ours: {', '.join(ours)}", "",
              f"**{'PASS' if same else 'FAIL'}** (same machines, same order)", ""]

    rec = con.execute(f"""
        WITH a AS (SELECT SUM(coin_in_usd) ci, SUM(house_win_usd) hw, SUM(theo_usd) th, SUM(available_hours) ah
                   FROM {g}.machine_day),
             p AS (SELECT SUM(coin_in_usd)::DOUBLE ci, SUM(house_win_usd)::DOUBLE hw, SUM(theo_usd)::DOUBLE th,
                          SUM(available_hours) ah FROM {b}.prepared_daily_view WHERE active),
             d AS (SELECT SUM(coin_in_usd)::DOUBLE ci, SUM(house_win_usd)::DOUBLE hw, SUM(theo_usd)::DOUBLE th,
                          SUM(available_machine_hours) ah FROM {b}.property_day)
        SELECT 'gold.machine_day' src, * FROM a UNION ALL SELECT 'prepared_daily_view (active)', * FROM p
        UNION ALL SELECT 'property_day', * FROM d""").df()
    base = rec.iloc[0, 1:].astype(float).to_numpy()
    rec_ok = all(np.allclose(base, rec.iloc[i, 1:].astype(float).to_numpy(), rtol=1e-9, atol=0.01)
                 for i in range(1, len(rec)))
    ok &= rec_ok
    lines += ["## 2. Totals reconcile", "", "| Source | Coin-in $ | House win $ | Theo $ | Available hours |",
              "|---|---:|---:|---:|---:|"]
    lines += [f"| {r.src} | {r.ci:,.2f} | {r.hw:,.2f} | {r.th:,.2f} | {r.ah:,.1f} |" for r in rec.itertuples()]
    lines += ["", f"**{'PASS' if rec_ok else 'FAIL'}** (all three agree to the cent / 0.01 h)", ""]

    z = con.execute(f"SELECT luck_z FROM {g}.machine_metrics_full").df()["luck_z"].to_numpy()
    n = len(z)
    sw = stats.shapiro(z)
    tails = [(c, int((z <= c).sum()), n * stats.norm.cdf(c)) for c in (-2.0, -2.5, -3.0, -3.7)]
    lines += ["## 3. Luck z-scores behave like luck", "",
              f"{n} machines: mean {z.mean():+.3f} (expect 0), SD {z.std(ddof=1):.3f} (expect 1), "
              f"Shapiro-Wilk p = {sw.pvalue:.3f}.", "", "| z at or below | Machines | Expected by chance |",
              "|---:|---:|---:|"]
    lines += [f"| {c} | {k} | {e:.1f} |" for c, k, e in tails]
    p_min = stats.norm.cdf(z.min())
    lines += ["", f"Most extreme: z = {z.min():.2f}; one-sided p = {p_min:.1e}; chance that at least one of "
                  f"{n} machines is this extreme by luck = {1 - (1 - p_min) ** n:.4f}.", ""]

    con.close()
    out = targets.ROOT / "docs" / "evidence" / "q1_validation.md"
    out.write_text("\n".join([f"# Q1 validation ({dt.datetime.now():%Y-%m-%d %H:%M})", "",
                              "Command: `uv run python -m royale.q1_validate`", ""] + lines))
    print("\n".join(lines))
    print("ALL PASS" if ok else "SOME CHECKS FAILED", "->", out)


if __name__ == "__main__":
    main()

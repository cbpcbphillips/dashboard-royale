"""Why did the floor get quieter after April? Test each explanation for the May-June slowdown (claim C23).

Descriptive, not a forecast: it may use May-June data and observed weather. Nothing here feeds the frozen
Apr 30 forecast. Weather: NOAA GHCN-Daily, Las Vegas (USW00023169), public domain.

Headline: coin-in per day, Jan-Apr vs May-Jun (whole floor, all play). Each test asks how much of that drop
the explanation can account for:
  1. Event and holiday mix    - the drop on event-free, non-holiday days, weekday-matched
  2. Fewer machines / downtime - open machine-hours per day; play lost to downtime (C12)
  3. Heat                      - within May-Jun only, do hotter days have less play (weekday-adjusted)?
  4. Comp change on Apr 28     - carded vs uncarded play: if both drop alike, it isn't the comps
  5. Back Forty                - the drop with Back Forty left out
  6. Fewer visitors            - door/zone counter crossings per covered sensor-hour
Share of the drop explained: >= 50% "explains most", 20-50% "explains part", < 20% "ruled out".
Ranges: 2,000 bootstrap draws of days within weekday.

Run: uv run python -m royale.q2_dip [--no-databricks]
Writes gold.demand_dip_tests and gold.demand_dip_weekly (DuckDB + Databricks).
"""
from __future__ import annotations

import argparse

import duckdb
import numpy as np
import pandas as pd

from royale import targets

SPLIT = pd.Timestamp("2025-05-01")


def verdict(share: float) -> str:
    if not np.isfinite(share) or share < 0.2:
        return "ruled out"
    return "explains most" if share >= 0.5 else "explains part"


def boot_drop(before: pd.DataFrame, after: pd.DataFrame, col: str, reps: int = 2000, seed: int = 7):
    """Weekday-matched % change in the mean of `col` (after vs before), with a bootstrap range."""
    rng = np.random.default_rng(seed)

    def stat(b, a):
        wd = sorted(set(b.local_weekday) & set(a.local_weekday))
        return np.mean([a[a.local_weekday == w][col].mean() / b[b.local_weekday == w][col].mean() - 1 for w in wd])

    point = stat(before, after)
    draws = []
    bg, ag = dict(tuple(before.groupby("local_weekday"))), dict(tuple(after.groupby("local_weekday")))
    for _ in range(reps):
        b = pd.concat([g.iloc[rng.integers(0, len(g), len(g))] for g in bg.values()])
        a = pd.concat([g.iloc[rng.integers(0, len(g), len(g))] for g in ag.values()])
        draws.append(stat(b, a))
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return float(point), float(lo), float(hi)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    args = ap.parse_args()
    t = targets.load()
    g, b = t["gold"], t["bronze"]
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    f = con.execute(f"""
        SELECT f.gaming_date, f.coin_in_usd AS coin, f.carded_coin_in_usd AS carded, f.coin_in_usd - f.carded_coin_in_usd AS uncarded,
               f.available_hours AS ah, f.occupied_hours AS oh, f.machines_active, c.local_weekday,
               (c.federal_holiday IS NOT NULL AND CAST(c.federal_holiday AS VARCHAR) <> '') AS holiday,
               COALESCE(w.tmax_c, NULL) AS tmax_c,
               COALESCE(d.lost_coin, 0) AS lost_coin,
               z.coin_b40, tr.entries, tr.cov_hours
        FROM {g}.floor_day f
        JOIN {b}.calendar_day c ON c.gaming_date = f.gaming_date
        LEFT JOIN {b}.weather_daily w ON CAST(w.source_date AS DATE) = f.gaming_date
        LEFT JOIN (SELECT gaming_date, SUM(lost_coin_in_usd) AS lost_coin FROM {g}.downtime_machine_day GROUP BY gaming_date) d
               ON d.gaming_date = f.gaming_date
        LEFT JOIN (SELECT gaming_date, SUM(coin_in_usd) AS coin_b40 FROM {g}.zone_day WHERE zone_id = 'Z-B40' GROUP BY gaming_date) z
               ON z.gaming_date = f.gaming_date
        LEFT JOIN (SELECT gaming_date, SUM(entries_observed) AS entries, SUM(covered_sensor_hours) AS cov_hours FROM {g}.zone_day GROUP BY gaming_date) tr
               ON tr.gaming_date = f.gaming_date
        ORDER BY f.gaming_date""").df()
    ev = con.execute(f"SELECT start_date, end_date FROM {b}.events").df()
    con.close()
    f["gaming_date"] = pd.to_datetime(f["gaming_date"])
    f["event"] = False
    for e in ev.itertuples():
        f.loc[(f.gaming_date >= pd.Timestamp(e.start_date)) & (f.gaming_date <= pd.Timestamp(e.end_date)), "event"] = True
    f["coin_no_b40"] = f.coin - f.coin_b40.fillna(0)
    f["occ"] = f.oh / f.ah
    f["traffic"] = f.entries / f.cov_hours
    f["coin_per_occ_hour"] = f.coin / f.oh
    before, after = f[f.gaming_date < SPLIT], f[f.gaming_date >= SPLIT]

    # headline: weekday-matched drop in coin-in per day
    drop, dlo, dhi = boot_drop(before, after, "coin")
    rows = [dict(test="Headline: coin-in per day, May–Jun vs Jan–Apr (weekday-matched)", change=drop, lo=dlo, hi=dhi,
                 share=np.nan, verdict="", note=f"{before.coin.mean():,.0f} → {after.coin.mean():,.0f} a day (raw means)")]

    # 1. events and holidays: the drop on ordinary days only
    plain_b, plain_a = before[~before.event & ~before.holiday], after[~after.event & ~after.holiday]
    d1, l1, h1 = boot_drop(plain_b, plain_a, "coin")
    share1 = 1 - d1 / drop
    rows.append(dict(test="Fewer events and holidays after April", change=d1, lo=l1, hi=h1, share=share1, verdict=verdict(share1),
                     note=f"On event-free, non-holiday days alone the drop is {d1:+.1%}, so events account for {share1:.0%} of it"))

    # 2. supply: open machine-hours, and play lost to downtime
    d2, l2, h2 = boot_drop(before, after, "ah")
    share2 = d2 / drop if drop else np.nan
    rows.append(dict(test="Fewer machines open (supply)", change=d2, lo=l2, hi=h2, share=share2, verdict=verdict(share2),
                     note=f"Open machine-hours per day changed {d2:+.1%}"))
    lost_b, lost_a = before.lost_coin.mean(), after.lost_coin.mean()
    share2b = (lost_a - lost_b) / (before.coin.mean() - after.coin.mean())
    rows.append(dict(test="More play lost to breakdowns (downtime)", change=(lost_a - lost_b) / before.coin.mean(), lo=np.nan, hi=np.nan,
                     share=share2b, verdict=verdict(share2b),
                     note=f"Play lost to downtime: ${lost_b:,.0f} → ${lost_a:,.0f} a day"))

    # 3. heat: within May-Jun only (avoids confusing heat with the seasonal trend), weekday-adjusted
    a = after.dropna(subset=["tmax_c"]).copy()
    a = a[~a.event & ~a.holiday]
    a["resid"] = a.coin / a.groupby("local_weekday").coin.transform("mean") - 1
    slope = float(np.polyfit(a.tmax_c, a.resid, 1)[0]) if len(a) > 10 else np.nan
    rng = np.random.default_rng(11)
    sl = [np.polyfit(a.tmax_c.values[i], a.resid.values[i], 1)[0] for i in (rng.integers(0, len(a), len(a)) for _ in range(2000))]
    s_lo, s_hi = np.percentile(sl, [2.5, 97.5])
    heat_gap = after.tmax_c.mean() - before.tmax_c.mean()
    implied = slope * heat_gap
    share3 = implied / drop if drop else np.nan
    rows.append(dict(test="Summer heat (NOAA, Las Vegas)", change=implied, lo=s_lo * heat_gap, hi=s_hi * heat_gap, share=share3, verdict=verdict(share3),
                     note=f"Within May–Jun, each +1 °C goes with {slope:+.2%} play (range {s_lo:+.2%} to {s_hi:+.2%}); "
                          f"May–Jun ran {heat_gap:+.1f} °C hotter, implying {implied:+.1%}"))

    # 4. comp change: carded vs uncarded
    dc, lc, hc = boot_drop(before, after, "carded")
    du, lu, hu = boot_drop(before, after, "uncarded")
    same = (lc <= hu) and (lu <= hc)  # ranges overlap
    rows.append(dict(test="The Apr 28 comp change (carded vs uncarded play)", change=dc - du, lo=np.nan, hi=np.nan,
                     share=0.0 if same else abs(dc - du) / abs(drop), verdict="ruled out" if same else verdict(abs(dc - du) / abs(drop)),
                     note=f"Card holders' play {dc:+.1%} (range {lc:+.1%} to {hc:+.1%}); non-card play {du:+.1%} (range {lu:+.1%} to {hu:+.1%})"))

    # 5. Back Forty
    d5, l5, h5 = boot_drop(before, after, "coin_no_b40")
    share5 = 1 - d5 / drop
    rows.append(dict(test="Back Forty (left out)", change=d5, lo=l5, hi=h5, share=share5, verdict=verdict(share5),
                     note=f"Without Back Forty the drop is {d5:+.1%}"))

    # what dropped: people playing (time in use) or how much they bet per hour
    do, lo_, ho = boot_drop(before, after, "occ")
    db, lb, hb = boot_drop(before, after, "coin_per_occ_hour")
    rows.append(dict(test="What fell: machines in use", change=do, lo=lo_, hi=ho, share=do / drop if drop else np.nan, verdict="",
                     note="Share of open machine time someone was playing"))
    rows.append(dict(test="What fell: amount played per busy hour", change=db, lo=lb, hi=hb, share=db / drop if drop else np.nan, verdict="",
                     note="Coin-in per occupied machine-hour"))

    dt, lt, ht = boot_drop(before.dropna(subset=["traffic"]), after.dropna(subset=["traffic"]), "traffic")
    rows.append(dict(test="Fewer people coming through the doors (door counters)", change=dt, lo=lt, hi=ht, share=dt / drop if drop else np.nan,
                     verdict=verdict(dt / drop) if drop else "",
                     note="Door and zone counter crossings per covered sensor-hour (offline hours left out)"))
    out = pd.DataFrame(rows)
    weekly = (f.assign(week=f.gaming_date.dt.to_period("W-SUN").dt.start_time.dt.date)
              .groupby("week").agg(coin_per_day=("coin", "mean"), event_days=("event", "sum"), tmax_c=("tmax_c", "mean"), days=("coin", "size"))
              .reset_index())
    pd.set_option("display.width", 220)
    print(out.round(4).to_string(index=False))

    con = duckdb.connect(str(targets.LOCAL_DB))
    for name, df in {"demand_dip_tests": out, "demand_dip_weekly": weekly}.items():
        con.register("df_tmp", df)
        con.execute(f"CREATE OR REPLACE TABLE {g}.{name} AS SELECT * FROM df_tmp")
        con.unregister("df_tmp")
    con.close()
    if not args.no_databricks:
        from royale import dbx
        gold = targets.prefixes("databricks")["gold"]
        for name, df in {"demand_dip_tests": out, "demand_dip_weekly": weekly}.items():
            dbx.write_table(df, f"{gold}.{name}", targets.volume_root())
        print("wrote gold.demand_dip_tests / demand_dip_weekly to Databricks")


if __name__ == "__main__":
    main()

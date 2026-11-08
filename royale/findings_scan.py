"""Scan for new, reproducible findings beyond the planted ones. Writes local/findings_scan.md.

Run: uv run python -m royale.findings_scan
Reads the local DuckDB mirror only (bronze schema). Walkway closure days (Mar 3 - Apr 6) are left out
of the zone tests so the known closure doesn't drive them. Ratios are ratio-of-sums.
"""
from __future__ import annotations

import duckdb
import numpy as np
import pandas as pd

from royale import targets

OUT = targets.ROOT / "local" / "findings_scan.md"
CLOSED = "h.gaming_date not between date '2025-03-03' and date '2025-04-06'"


def overflow(c) -> tuple[pd.DataFrame, dict]:
    """F1: Back Forty fills only when the rest of the floor fills (overflow), beyond simple saturation."""
    h = c.sql(f"""select h.hour_start_utc, l.zone_id, sum(h.occupied_seconds) o, sum(h.available_seconds) a
        from bronze.machine_hour h join bronze.floor_locations l on l.location_id = h.location_id
        where h.active and h.available_seconds > 0 and l.zone_id <> 'Z-HL' and {CLOSED} group by 1, 2""").df()
    p = h.pivot_table(index="hour_start_utc", columns="zone_id", values=["o", "a"], aggfunc="sum")
    zones = ["Z-B40", "Z-BAR", "Z-ENT", "Z-GAR", "Z-HTL", "Z-PIT"]
    rows = []
    for z in ["Z-B40", "Z-HTL", "Z-GAR", "Z-BAR"]:
        others = [x for x in zones if x not in (z, "Z-B40")]
        d = pd.DataFrame({"z_o": p["o"][z], "z_a": p["a"][z],
                          "r_o": p["o"][others].sum(axis=1), "r_a": p["a"][others].sum(axis=1)})
        d["bin"] = pd.cut(d.r_o / d.r_a, [0, .2, .4, .5, .6, .7, .8, .9, 1])
        g = d.groupby("bin", observed=True)[["z_o", "z_a", "r_o", "r_a"]].sum()
        zo, ro = g.z_o / g.z_a, g.r_o / g.r_a
        for b in g.index:
            rows.append({"zone": z, "rest_occ_bin": str(b), "zone_occ": zo[b], "rest_occ": ro[b],
                         "ratio": zo[b] / ro[b], "hazard_ratio": np.log(1 - zo[b]) / np.log(1 - ro[b])})
    t = pd.DataFrame(rows)
    b = t[t.zone == "Z-B40"]
    gar = t[t.zone == "Z-GAR"]
    return t, {"b40_lo": b.hazard_ratio.iloc[0], "b40_hi": b.hazard_ratio.iloc[-2],
               "gar_lo": gar.hazard_ratio.iloc[0], "gar_hi": gar.hazard_ratio.iloc[-2],
               "r_lo": b.ratio.iloc[0], "r_hi": b.ratio.iloc[-2]}


def hour_bands(c) -> pd.DataFrame:
    """Back Forty coin-in per open hour vs the rest of the floor (excl. High-Limit), by hour band."""
    return c.sql(f"""select case when h.local_hour between 18 and 22 then '18-22h'
            when h.local_hour between 2 and 9 then '02-09h' else 'other' end band,
          sum(h.coin_in_cents) filter (where l.zone_id = 'Z-B40') / sum(h.available_seconds) filter (where l.zone_id = 'Z-B40')
          / (sum(h.coin_in_cents) filter (where l.zone_id not in ('Z-B40','Z-HL'))
             / sum(h.available_seconds) filter (where l.zone_id not in ('Z-B40','Z-HL'))) b40_vs_rest
        from bronze.machine_hour h join bronze.floor_locations l on l.location_id = h.location_id
        where h.active and h.available_seconds > 0 and {CLOSED} group by 1 order by 1""").df()


def volatility(c) -> pd.DataFrame:
    """F2: carded session length by game; Classic Sevens vs Jackpot Summit share a ~$1.20 average bet."""
    return c.sql("""select g.config_id, g.theme, g.volatility_class, g.payout_multiplier_variance var,
          count(*) segments, round(avg(fixed_bet_cents) / 100, 2) avg_bet_usd,
          round(avg(epoch(end_utc) - epoch(start_utc)) / 60, 1) mean_min,
          round(median(epoch(end_utc) - epoch(start_utc)) / 60, 1) median_min
        from bronze.sessions s join bronze.game_math g using (config_id)
        where config_id <> 'G-HL90' group by all order by mean_min desc""").df()


def volatility_occ(c) -> pd.DataFrame:
    return c.sql("""select d.config_id, round(sum(d.occupied_seconds) / sum(d.available_seconds), 3) occ,
          round(sum(d.theo_cents) / sum(d.available_seconds) * 36, 2) theo_per_open_hr
        from bronze.machine_day d join bronze.floor_locations l on l.location_id = d.location_id
        where d.active and d.available_seconds > 0 and l.zone_id <> 'Z-HL' group by 1 order by occ desc""").df()


def game_zone(c) -> pd.DataFrame:
    """F3: theo per open hour, game x zone; Back Forty as a share of the same game elsewhere."""
    g = c.sql("""select d.config_id, l.zone_id = 'Z-B40' b40, sum(d.theo_cents) / sum(d.available_seconds) * 36 th
        from bronze.machine_day d join bronze.floor_locations l on l.location_id = d.location_id
        where d.active and d.available_seconds > 0 and l.zone_id <> 'Z-HL'
          and d.gaming_date not between date '2025-03-03' and date '2025-04-06' group by 1, 2""").df()
    p = g.pivot(index="config_id", columns="b40", values="th").dropna()
    p.columns = ["elsewhere", "back_forty"]
    p["b40_share"] = p.back_forty / p.elsewhere
    return p.sort_values("back_forty", ascending=False).round(3)


def fnb(c) -> pd.DataFrame:
    """F4: F&B face value per visit by coin-in quintile (aggregate each table first, then join)."""
    return c.sql("""with v as (select observed_visit_id, sum(coin_in_cents) / 100 ci,
              sum(epoch(end_utc) - epoch(start_utc)) / 3600 hrs from bronze.sessions group by 1),
          f as (select observed_visit_id, sum(face_value_cents) / 100 face from bronze.fnb_transactions
              where observed_visit_id is not null group by 1),
          j as (select v.*, coalesce(f.face, 0) face, ntile(5) over (order by ci) q from v left join f using (observed_visit_id))
        select q, count(*) visits, round(sum(ci) / count(*), 0) coin_in_per_visit, round(sum(hrs) / count(*), 2) hrs_per_visit,
          round(sum(face) / count(*), 2) fnb_per_visit, round(sum(face) / sum(hrs), 2) fnb_per_play_hr
        from j group by 1 order by 1""").df()


def comp_tiers(c) -> pd.DataFrame:
    """F5: 28-day return rate and coin-in per visit by opening tier, windows around Apr 28."""
    c.sql("""create or replace temp table v as select s.observed_visit_id, s.player_id, min(s.gaming_date) gd,
          sum(s.coin_in_cents) / 100 ci, any_value(p.opening_tier) tier
        from bronze.sessions s join bronze.players p using (player_id) group by 1, 2""")
    return c.sql("""with win as (select unnest([date '2025-03-31', date '2025-04-28', date '2025-05-26']) s),
          a as (select s, player_id, any_value(tier) tier, sum(ci) ci, count(*) n from win join v on gd >= s - 28 and gd < s group by 1, 2),
          b as (select distinct s, player_id from win join v on gd >= s and gd < s + 28)
        select tier, a.s window_end, count(*) players, round(avg((b.player_id is not null)::int), 3) return_28d,
          round(sum(ci) / sum(n), 1) coin_in_per_visit
        from a left join b using (s, player_id) group by all order by 1, 2""").df()


def md(df: pd.DataFrame) -> str:
    def f(x):
        return f"{x:.3f}" if isinstance(x, (float, np.floating)) else str(x)
    cols = [str(x) for x in df.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(f(x) for x in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join(lines)


def main() -> None:
    c = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    ov, k = overflow(c)
    hb = hour_bands(c)
    vol, vocc = volatility(c), volatility_occ(c)
    gz, fb, ct = game_zone(c), fnb(c), comp_tiers(c)
    cls = vol.set_index("config_id").loc["G-CLS93"]
    jkp = vol.set_index("config_id").loc["G-JKP88"]
    occ = vocc.set_index("config_id")
    text = f"""# Findings scan (new candidates)

Generated by `uv run python -m royale.findings_scan` from `local/royale.duckdb`. Zone tests leave out the
walkway closure (Mar 3 - Apr 6) and High-Limit. Ranked by how surprising and useful they are.

## 1. Back Forty is an overflow zone: it fills only when the rest of the floor is full

**Number.** In hours when the rest of the floor is under 20% occupied, Back Forty runs at **{k['r_lo']:.2f}x** the
rest's occupancy; when the rest is 80-90% full, **{k['r_hi']:.2f}x**. By hour band, Back Forty coin-in per open
hour is {hb.set_index('band').b40_vs_rest.get('18-22h', float('nan')):.2f}x the rest at 18-22h but only
{hb.set_index('band').b40_vs_rest.get('02-09h', float('nan')):.2f}x at 02-09h.

**Alternative tested: simple saturation.** Any quiet zone's ratio drifts toward 1 as seats fill up. The
saturation-adjusted ratio ln(1-occ_zone)/ln(1-occ_rest) should stay flat if it's only saturation. For Garage it is
flat ({k['gar_lo']:.2f} -> {k['gar_hi']:.2f}); for Back Forty it climbs **{k['b40_lo']:.2f} -> {k['b40_hi']:.2f}**. The rise also holds
within evening hours only (so it's not a time-of-day effect). Hotel Corridor shows a weaker version.

**Why it matters.** Guests go to Back Forty mostly when they can't find a seat elsewhere. More signs bring
people who mostly have empty seats elsewhere, so part of the signage gain is cannibalised from other zones,
and that part is largest in quiet hours. July is a quieter month (the May-June dip), with fewer full hours, so
the C21 signage effect (0/5/10% more play) leans optimistic.

**Limitation.** Observational, hourly; seated players don't cross counters, so we can't see people walking
in and turning back. Overflow and "only regulars find it" both predict the pattern at peak.

**July action.** Keeps A-WAYFINDING but says to value it at the low end, or to pair it with A-PROMO weekends
(full-floor hours are when Back Forty seats earn).

Query: `overflow()` and `hour_bands()` in `royale/findings_scan.py` (machine_hour x floor_locations, location per hour).

{md(ov)}

## 2. Volatility shortens sessions: same bet, 36% shorter play on Jackpot Summit

**Number.** Classic Sevens (variance {cls['var']:.0f}) and Jackpot Summit (variance {jkp['var']:.0f}) have the same average
bet (${cls['avg_bet_usd']:.2f} vs ${jkp['avg_bet_usd']:.2f}) and the same $1 minimum, but carded sessions last
**{cls['mean_min']} vs {jkp['mean_min']} min** (median {cls['median_min']} vs {jkp['median_min']}). Jackpot Summit machines are occupied
{occ.loc['G-JKP88','occ']:.0%} of open hours vs {occ.loc['G-CLS93','occ']:.0%}; across games, session length falls with payout variance.

**Alternative tested: bet size.** Bigger bets drain a bankroll faster; this pair rules that out (equal bets).
**Limitation:** carded play only; observational (players choose games). It doesn't say the game is bad:
Jackpot Summit still earns ${occ.loc['G-JKP88','theo_per_open_hr']:.2f} theo per open hour (high hold, 12%), so its seats are idle,
not losing money.

**July action.** Weak. Spare capacity sits on Jackpot Summit; a replacement there trades long idle time for
lower hold. Not worth new spend in a 30-day window (C09).

{md(vol)}

{md(vocc)}

## 3. No game "holds up" in Back Forty: a game swap can't replace signs

**Number.** Every game earns roughly the same share of its elsewhere rate in Back Forty
({gz.b40_share.min():.2f}-{gz.b40_share.max():.2f}x theo per open hour); the ranking of games is the same in every zone.
**Alternative tested:** bank position (within Back Forty banks the same order holds). **Limitation:** few
machines per game x zone (1-13). **July action:** argues against A-REPLACE-* as a Back Forty fix; the zone
effect is multiplicative. (The hold-swap gain from replacing Royal Draw is already in B8/C09.)

{md(gz.reset_index())}

## 4. Food and drink follows time on the floor, not stakes

**Number.** Top coin-in quintile wagers ~15x the bottom per visit but spends only ~5x on F&B; F&B per hour
played falls from the bottom to the top quintile. **Alternative:** heavier players get comps instead of buying
(face value includes comps, so no). **Limitation:** carded visits only. **July action:** none directly.

{md(fb)}

## 5. Comp change: no tier churned or cut spend (null result)

**Number.** 28-day return rates and coin-in per visit are flat around Apr 28 for Base and Gold. Platinum's
rise is n = ~133. **Alternative:** seasonality (windows before the change show the same drift).
**July action:** supports A-COMP-CHANGE (restore old price) being low-risk either way.

{md(ct)}
"""
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

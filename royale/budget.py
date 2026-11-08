"""Q6: the $100,000 plan for July 1-30, 2025, as a cost analysis (docs/plans/B6_budget.md, D-012, D-034-D-037).

For every action in the catalog: cost by the catalog formula, and a low / mid / high benefit computed
from the gold tables (expected earnings = theo, luck excluded), over only the days left after its lead
time. Then every allowed portfolio (<= 3 action types, <= $100k, quantity limits, comp_policy actions
exclusive) is scored, so the chosen one can be compared with all the others.

Cost  = qty x (unit_cost + recurring_per_day x max(0, 30 - lead_days)) / 100   (GUIDE section 6)
        + machine downtime valued at the machine's expected earnings per hour
Net   = benefit - cost

Run: uv run python -m royale.budget [--no-databricks]
Writes gold.budget_actions and gold.budget_portfolios (DuckDB + Databricks) and web/data/q6.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json

import duckdb
import numpy as np
import pandas as pd

from royale import targets

BUDGET = 100_000
WINDOW = 30  # July 1-30
MAX_TYPES = 3


def facts(con, g: str, b: str) -> dict:
    """Every number the benefits use, read from the gold tables (each traces to a claim)."""
    q = lambda s: con.execute(s).fetchone()
    f = {}
    f["floor_theo_hold"] = q(f"SELECT SUM(theo_usd) / SUM(coin_in_usd) FROM {g}.floor_day")[0]
    f["floor_tpah"] = q(f"SELECT SUM(theo_usd) / SUM(available_hours) FROM {g}.machine_day")[0]
    ev = con.execute(f"SELECT name, uplift, uplift_lo, extra_coin_in_usd, event_days FROM {g}.event_uplift WHERE name LIKE 'Gilded Ace%'").df().set_index("name")
    f["promo_locals"] = ev.loc["Gilded Ace Locals Appreciation Week"].to_dict()
    f["promo_tournament"] = ev.loc["Gilded Ace Winter Slot Tournament"].to_dict()
    # recent baseline: May-June (the floor ran ~5% below the earlier months, C14/C17)
    f["june_vs_half"] = q(f"""SELECT (SUM(CASE WHEN gaming_date >= DATE '2025-05-01' THEN coin_in_usd END) / COUNT(CASE WHEN gaming_date >= DATE '2025-05-01' THEN 1 END))
                                     / (SUM(coin_in_usd) / COUNT(*)) FROM {g}.floor_day""")[0]
    m = con.execute(f"SELECT theo_usd, house_win_usd, days_on_floor, tpah FROM {g}.machine_metrics_full WHERE machine_id = 'M-1158'").df().iloc[0]
    f["m1158_leak_per_day"] = (m.theo_usd - m.house_win_usd) / m.days_on_floor
    f["m1158_tpah"] = m.tpah
    z = con.execute(f"""SELECT zone_id, SUM(theo_usd) / COUNT(DISTINCT gaming_date) AS theo_day, SUM(theo_usd) / SUM(available_hours) AS tpah
                        FROM {g}.zone_day WHERE gaming_date >= DATE '2025-05-01' GROUP BY zone_id""").df().set_index("zone_id")
    f["b40_theo_day"] = z.loc["Z-B40", "theo_day"]
    f["b40_tpah"] = z.loc["Z-B40", "tpah"]
    f["pit_tpah"], f["htl_tpah"] = z.loc["Z-PIT", "tpah"], z.loc["Z-HTL", "tpah"]
    f["b40_machine_hours_day"] = q(f"SELECT SUM(available_hours) / COUNT(DISTINCT gaming_date) / COUNT(DISTINCT machine_id) FROM {g}.machine_day WHERE zone_id = 'Z-B40' AND gaming_date >= DATE '2025-05-01'")[0]
    # comps (C07): cost share before/after, carded theo per day after the change
    c = con.execute(f"SELECT reinvestment_before, reinvestment_after FROM {g}.comp_change WHERE opening_tier = 'All (actual mix)'").df().iloc[0]
    f["comp_reinv_before"], f["comp_reinv_after"] = c.reinvestment_before, c.reinvestment_after
    f["carded_theo_day"] = q(f"SELECT SUM(carded_theo_usd) / SUM(days) FROM {g}.comp_week WHERE week_start >= DATE '2025-05-05'")[0]
    # downtime (C05, C12): value of an hour down; grave-shift waiting in May-June; Ridgeline fault hours
    f["lost_theo_per_down_hour"] = q(f"SELECT SUM(lost_theo_usd) / SUM(down_hours) FROM {g}.downtime_machine_day")[0]
    t = con.execute(f"""SELECT shift, SUM(wait_hours) / COUNT(DISTINCT gaming_date) AS wait_h_day, SUM(wait_hours) / NULLIF(SUM(faults), 0) AS avg_wait
                        FROM {g}.tech_shift_day WHERE gaming_date >= DATE '2025-05-01' GROUP BY shift""").df().set_index("shift")
    f["grave_wait_h_day"], f["grave_avg_wait"] = t.loc["grave", "wait_h_day"], t.loc["grave", "avg_wait"]
    f["dayswing_avg_wait"] = t.loc[["day", "swing"], "avg_wait"].mean()
    r = con.execute(f"""SELECT SUM(CASE WHEN manufacturer = 'Ridgeline' THEN down_hours END) / 181.0 AS h_day,
                               COUNT(DISTINCT CASE WHEN manufacturer = 'Ridgeline' THEN machine_id END) AS n
                        FROM {g}.downtime_ticket WHERE event_type = 'fault_repair'""").df().iloc[0]
    f["ridgeline_fault_h_day"], f["ridgeline_machines"] = r.h_day, int(r.n)
    # replacement (C09, C18): the largest play shortfall per day of any machine
    f["best_replace_gain_day"] = 5513 / 181  # M-1252, $5,513 short over 181 days (C18)

    # profit, not just expected earnings: revenue-share leases give the vendor 20% of house win (cost_rules
    # CR-LEASE-SHARE), and extra carded play earns comps at the post-change rate (C07)
    share = con.execute(f"SELECT rate FROM {b}.cost_rules WHERE cost_rule_id = 'CR-LEASE-SHARE'").fetchone()[0]
    rs = lambda where: q(f"""SELECT SUM(CASE WHEN lease_class = 'leased_revenue_share' THEN theo_usd END) / SUM(theo_usd)
                             FROM {g}.machine_day WHERE gaming_date >= DATE '2025-05-01' {where}""")[0]
    f["vendor_share_rate"] = float(share)
    f["revshare_frac_floor"], f["revshare_frac_b40"] = rs(""), rs("AND zone_id = 'Z-B40'")
    f["m1158_revshare"] = q(f"SELECT MAX(CASE WHEN lease_class = 'leased_revenue_share' THEN 1 ELSE 0 END) FROM {g}.machine_day WHERE machine_id = 'M-1158'")[0]
    f["carded_share"] = q(f"SELECT SUM(carded_coin_in_usd) / SUM(coin_in_usd) FROM {g}.floor_day")[0]

    # signs anchored on the walkway closure (C11): how much Back Forty play follows its foot traffic, and how much
    # traffic it never got back after reopening
    w = con.execute(f"SELECT area, period, occupancy, entries_per_covered_hour AS tr FROM {g}.walkway_periods").df()
    v = lambda area, per, col: float(w[(w.area == area) & (w.period.str.startswith(per))][col].iloc[0])
    occ_did = (v("Back Forty", "2", "occupancy") / v("Back Forty", "1", "occupancy")) / (v("Rest of floor", "2", "occupancy") / v("Rest of floor", "1", "occupancy"))
    tr_did = (v("Back Forty", "2", "tr") / v("Back Forty", "1", "tr")) / (v("Rest of floor", "2", "tr") / v("Rest of floor", "1", "tr"))
    f["traffic_elasticity"] = (1 - occ_did) / (1 - tr_did)
    f["b40_traffic_headroom"] = v("Back Forty", "1", "tr") / v("Back Forty", "3", "tr") - 1
    # how much of Back Forty's play is new to the casino (C26, D-090): while the walkway was closed, Back Forty lost
    # occupied hours and the rest of the floor gained them. Displaced share = rest's gain / Back Forty's loss, measured
    # against the weeks before the closure (mid) and after reopening (low: the rest gained more than Back Forty lost)
    zd = con.execute(f"""SELECT CASE WHEN zone_id = 'Z-B40' THEN 'b40' ELSE 'rest' END AS area,
                               CASE WHEN walkway_closed THEN 2
                                    WHEN gaming_date < (SELECT MIN(gaming_date) FROM {g}.zone_day WHERE walkway_closed) THEN 1 ELSE 3 END AS per,
                               SUM(occupied_hours) / SUM(available_hours) AS occ, SUM(available_hours) / COUNT(DISTINCT gaming_date) AS av
                        FROM {g}.zone_day WHERE zone_id <> 'Z-HL' GROUP BY 1, 2""").df().set_index(["area", "per"])
    o = lambda area, per: float(zd.loc[(area, per), "occ"])
    av_b, av_r = float(zd.loc[("b40", 2), "av"]), float(zd.loc[("rest", 2), "av"])
    disp = lambda base: ((o("rest", 2) - o("rest", base)) * av_r) / ((o("b40", base) - o("b40", 2)) * av_b)
    f["b40_displaced_before"], f["b40_displaced_after"] = disp(1), disp(3)
    f["b40_new_play_mid"] = float(min(1.0, max(0.0, 1 - f["b40_displaced_before"])))
    f["b40_new_play_low"] = float(min(1.0, max(0.0, 1 - f["b40_displaced_after"])))

    # the forecast as the promotion's baseline: day-to-day error of the model's whole-floor forecast in the
    # frozen test (bias removed, since the July baseline is refit on Jan-Jun), and the smallest lift it can detect
    d = con.execute(f"""SELECT gaming_date, SUM(actual * available_hours) / SUM(pred_model * available_hours) - 1 AS err
                        FROM {g}.model_predictions WHERE target = 'tpah' GROUP BY gaming_date""").df()
    f["forecast_day_sd"] = float(d.err.std(ddof=1))
    f["promo_days"] = 6
    f["detectable_lift"] = 1.96 * f["forecast_day_sd"] / np.sqrt(f["promo_days"])
    return {k: (float(v) if isinstance(v, (int, float, np.floating, np.integer)) else v) for k, v in f.items()}


def actions(cat: pd.DataFrame, f: dict) -> pd.DataFrame:
    """One row per candidate (action x quantity), with cost and low/mid/high benefit and the assumption used."""
    c = cat.set_index("action_type_id")
    days_left = lambda a: max(0, WINDOW - int(c.loc[a, "lead_days"]))
    def cost(a, qty, downtime_value_per_unit=0.0):
        unit = (c.loc[a, "unit_cost_cents"] + c.loc[a, "recurring_cost_cents_per_day"] * days_left(a)) / 100
        return qty * unit + qty * downtime_value_per_unit
    rows = []
    def add(a, qty, target, lo, mid, hi, how, evidence, down=0.0):
        rows.append(dict(action=a, name=c.loc[a, "name"], qty=qty, target=target, cost=round(cost(a, qty, down), 0),
                         benefit_low=round(lo, 0), benefit_mid=round(mid, 0), benefit_high=round(hi, 0),
                         benefit_days=days_left(a), how=how, evidence=evidence, group=c.loc[a, "incompatibility_group"] if pd.notna(c.loc[a, "incompatibility_group"]) else None))

    hold, soft = f["floor_theo_hold"], f["june_vs_half"]
    comp_cost = f["comp_reinv_after"] * f["carded_share"]
    floor_pf = 1 - f["vendor_share_rate"] * f["revshare_frac_floor"] - comp_cost   # extra play across the floor
    b40_pf = 1 - f["vendor_share_rate"] * f["revshare_frac_b40"] - comp_cost        # extra play in Back Forty
    m1158_pf = 1 - f["vendor_share_rate"] * f["m1158_revshare"]                     # recovered payout (no new play)
    PF = {"A-PROMO": floor_pf, "A-INSPECT": m1158_pf, "A-WAYFINDING": b40_pf, "A-MOVE-MACHINE": b40_pf, "A-TECH-SHIFT": floor_pf,
          "A-PREVENTIVE": floor_pf, "A-REPLACE-LEASE": floor_pf, "A-REPLACE-BUY": floor_pf, "A-COMP-CHANGE": 1.0, "A-COMP-PILOT": 1.0,
          "A-MOVE-BANK": 1.0, "A-SURVEY": 1.0}
    lw, wt = f["promo_locals"], f["promo_tournament"]
    # a 3-day promo weekend: the smaller own promo scaled to 3 days (mid), the tournament (high), and the
    # tournament's low-end lift with summer softness (low)
    mid1 = lw["extra_coin_in_usd"] / lw["event_days"] * 3 * hold
    hi1 = wt["extra_coin_in_usd"] * hold
    lo1 = wt["extra_coin_in_usd"] * (wt["uplift_lo"] - 1) / (wt["uplift"] - 1) * hold * soft * (mid1 / hi1)
    add("A-PROMO", 1, "1 weekend (Jul 18-20)", lo1, mid1, hi1,
        f"Extra expected earnings from one 3-day promo: Locals Week's lift per day x 3 (mid), Winter Slot Tournament (high), low-end lift x summer softness ({soft:.2f}) (low)", "C10")
    add("A-PROMO", 2, "2 weekends (Jul 18-20, Jul 25-27)", lo1 * 1.5, mid1 * 1.75, hi1 * 2,
        "Second weekend assumed to add 50% / 75% / 100% of the first (back-to-back promos untested)", "C10")
    leak = f["m1158_leak_per_day"] * days_left("A-INSPECT")
    add("A-INSPECT", 1, "M-1158", 0, leak, leak,
        f"If the paytable/meter fault is found and fixed: its leak of ${f['m1158_leak_per_day']:.0f}/day for the days left; low = nothing found",
        "C03", down=2 * f["m1158_tpah"])
    w = f["b40_theo_day"] * days_left("A-WAYFINDING")
    el, head = f["traffic_elasticity"], f["b40_traffic_headroom"]
    nn_lo, nn = f["b40_new_play_low"], f["b40_new_play_mid"]
    add("A-WAYFINDING", 1, "Back Forty", 0, nn * el * head / 2 * w, nn * el * head * w,
        f"Signs win back none / half / all of the foot traffic Back Forty never regained after the walkway reopened (+{head:.1%}); "
        f"play follows traffic at {el:.2f}× (the closure: traffic and time in use fell together), so +0% / +{el * head / 2:.1%} / +{el * head:.1%} play on "
        f"${f['b40_theo_day']:,.0f}/day expected. Only {nn:.0%} of it is new to the casino (low {nn_lo:.0%}): during the closure the rest of the floor "
        f"picked up {f['b40_displaced_before']:.0%} of the hours Back Forty lost (C26)", "C11, C26")
    gain_mh = f["b40_tpah"] * f["b40_machine_hours_day"] * (((f["pit_tpah"] * 2 + f["htl_tpah"]) / 3) / f["b40_tpah"] - 1)
    mm = 3 * gain_mh * days_left("A-MOVE-MACHINE")
    add("A-MOVE-MACHINE", 3, "3 Back Forty machines -> the 3 empty slots (Center Pit x2, Hotel x1)", 0.25 * mm, 0.5 * mm, mm,
        "Each moved machine earns at its new zone's rate; 25% / 50% / 100% of that is new play (the rest is taken from neighbours)", "C16",
        down=3 * f["b40_tpah"])
    add("A-MOVE-BANK", 1, "Swap a Back Forty bank with a busier one", 0, 0, 0,
        "A swap moves the quiet spot to another bank: the location effect stays with the slot (near zero-sum)", "C16", down=8 * 6 * f["floor_tpah"])
    savings = (f["comp_reinv_after"] - f["comp_reinv_before"]) * f["carded_theo_day"]
    add("A-COMP-CHANGE", 1, "Restore ~13 points per comp $ floor-wide", 0, savings * days_left("A-COMP-CHANGE"), savings * days_left("A-COMP-CHANGE"),
        f"Saves the post-change rise in comp cost ({(f['comp_reinv_after'] - f['comp_reinv_before']) * 100:.2f} pts of ${f['carded_theo_day']:,.0f}/day carded expected earnings); low = guests visit less", "C07")
    add("A-COMP-PILOT", 1, "Half of card holders back on ~13 points, half control", 0, 0.5 * savings * days_left("A-COMP-PILOT"), 0.5 * savings * days_left("A-COMP-PILOT"),
        "Half the savings, plus a measured answer (control group)", "C07")
    tw = f["grave_wait_h_day"] * (1 - f["dayswing_avg_wait"] / f["grave_avg_wait"]) * f["lost_theo_per_down_hour"] * days_left("A-TECH-SHIFT")
    add("A-TECH-SHIFT", 1, "Grave shift", 0.5 * tw, 0.75 * tw, tw,
        f"Grave-shift waits ({f['grave_avg_wait']:.1f} h) cut to day/swing levels ({f['dayswing_avg_wait']:.1f} h), valued at ${f['lost_theo_per_down_hour']:.0f} per machine-hour down; 50% / 75% / 100% achieved", "C05, C12")
    pm = f["ridgeline_fault_h_day"] * f["lost_theo_per_down_hour"] * days_left("A-PREVENTIVE")
    add("A-PREVENTIVE", 1, "Ridgeline", 0.1 * pm, 0.3 * pm, 0.5 * pm,
        f"Ridgeline faults cost {f['ridgeline_fault_h_day']:.1f} machine-hours/day; a sweep prevents 10% / 30% / 50%", "C06, C12",
        down=f["ridgeline_machines"] * 1.5 * f["floor_tpah"])
    add("A-SURVEY", 1, "1 month", 0, 0, 0, "Information only (why guests skip Back Forty)", "C11")
    rg = f["best_replace_gain_day"] * days_left("A-REPLACE-LEASE")
    add("A-REPLACE-LEASE", 1, "Most underperforming unit (M-1252)", 0, rg, 2 * rg,
        "Its whole play shortfall vs prediction for the days left after the 14-day lead (high = twice that)", "C09, C18", down=6 * f["floor_tpah"])
    rb = f["best_replace_gain_day"] * days_left("A-REPLACE-BUY")
    add("A-REPLACE-BUY", 1, "Most underperforming unit (M-1252)", 0, rb, 2 * rb, "As above, 9 days left after a 21-day lead", "C09, C18", down=6 * f["floor_tpah"])
    a = pd.DataFrame(rows)
    # gains are expected earnings until here; convert to profit (vendor revenue share and comps on extra play removed)
    a["profit_factor"] = a.action.map(PF).astype(float)
    a["gross_mid"] = a["benefit_mid"]
    for s in ("low", "mid", "high"):
        a[f"benefit_{s}"] = (a[f"benefit_{s}"] * a["profit_factor"]).round(0)
        a[f"net_{s}"] = a[f"benefit_{s}"] - a["cost"]
    a["return_per_dollar_mid"] = (a["benefit_mid"] / a["cost"]).round(2)
    return a


def portfolios(a: pd.DataFrame) -> pd.DataFrame:
    """Every allowed combination: <= 3 action types, one quantity per type, <= $100k, comp_policy exclusive."""
    opts = [g for _, g in a.groupby("action")]
    out = []
    for k in range(1, MAX_TYPES + 1):
        for types in itertools.combinations(opts, k):
            for pick in itertools.product(*[t.index for t in types]):
                rows = a.loc[list(pick)]
                if rows.cost.sum() > BUDGET or (rows.group == "comp_policy").sum() > 1:
                    continue
                out.append(dict(actions=" + ".join(f"{r.action}" + (f" x{r.qty}" if r.qty > 1 else "") for r in rows.itertuples()),
                                types=k, cost=rows.cost.sum(), net_low=rows.net_low.sum(), net_mid=rows.net_mid.sum(), net_high=rows.net_high.sum()))
    p = pd.DataFrame(out).sort_values(["net_mid", "net_low"], ascending=False).reset_index(drop=True)
    p["rank_mid"] = np.arange(1, len(p) + 1)
    p["rank_low"] = p.net_low.rank(ascending=False, method="min").astype(int)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    args = ap.parse_args()
    t = targets.load()
    con = duckdb.connect(str(targets.LOCAL_DB))
    cat = con.execute(f"SELECT * FROM {t['bronze']}.action_catalog").df()
    f = facts(con, t["gold"], t["bronze"])
    a = actions(cat, f)
    p = portfolios(a)
    chosen = "A-INSPECT + A-PROMO x2"  # D-091 (signs dropped after C26, D-090; was D-083 with signs); alphabetical, as portfolios list them
    pd.set_option("display.width", 250)
    print(a[["action", "qty", "cost", "benefit_low", "benefit_mid", "benefit_high", "net_mid", "return_per_dollar_mid"]].sort_values("net_mid", ascending=False).to_string(index=False))
    print(f"\n{len(p)} allowed portfolios. Top 8 by mid net:")
    print(p.head(8).to_string(index=False))
    print("\nBest by low case:", p.sort_values("net_low", ascending=False).head(3).to_string(index=False))
    print("\nChosen (D-012):", p[p.actions == chosen].to_string(index=False))

    con.execute(f"CREATE OR REPLACE TABLE {t['gold']}.budget_actions AS SELECT * FROM a")
    con.execute(f"CREATE OR REPLACE TABLE {t['gold']}.budget_portfolios AS SELECT * FROM p")
    con.close()
    if not args.no_databricks:
        from royale import dbx
        gold = targets.prefixes("databricks")["gold"]
        dbx.write_table(a, f"{gold}.budget_actions", targets.volume_root())
        dbx.write_table(p, f"{gold}.budget_portfolios", targets.volume_root())
        print("wrote gold.budget_actions / budget_portfolios to Databricks")
    out = targets.ROOT / "web" / "data" / "q6.json"
    payload = {"meta": {"generated_at": dt.datetime.now().isoformat(timespec="seconds"), "source": "royale/budget.py from the gold tables; written to royale.gold.budget_actions / budget_portfolios",
                        "budget": BUDGET, "window": "July 1-30, 2025", "chosen": chosen},
               "facts": f, "actions": json.loads(a.to_json(orient="records")), "portfolios": json.loads(p.head(25).to_json(orient="records")),
               "chosen": json.loads(p[p.actions == chosen].to_json(orient="records")),
               "safest": json.loads(p.sort_values(["net_low", "net_mid"], ascending=False).head(1).to_json(orient="records")),
               "n_portfolios": len(p)}
    out.write_text(json.dumps(payload, indent=1, default=str))
    print("wrote", out)


if __name__ == "__main__":
    main()

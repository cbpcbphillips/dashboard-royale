"""Q5 (D-029): find when the comp redemption rate changed, then compare before vs after with
the tier mix held fixed.

1. Change week: the split of the weekly "points per comp $" series that best separates it into
   two flat segments (least squares). Only full 7-day weeks are used.
2. Before = whole months ending before the change week; after = whole months starting after it.
   The month containing the change is left out.
3. Tier-mix check: after-period reinvestment re-weighted to the BEFORE-period theo mix by tier
   (direct standardization). If the rise survives re-weighting, it is not just a mix shift.
Writes gold.comp_change (both engines). Run: uv run python -m royale.q5_comp_change
"""
import duckdb
import numpy as np
import pandas as pd

from royale import targets


def change_week(w: pd.DataFrame) -> tuple[pd.Timestamp, float, float]:
    y = w["points_per_comp_face_usd"].to_numpy()
    best = None
    for k in range(3, len(y) - 2):
        sse = ((y[:k] - y[:k].mean()) ** 2).sum() + ((y[k:] - y[k:].mean()) ** 2).sum()
        if best is None or sse < best[0]:
            best = (sse, k)
    k = best[1]
    return pd.Timestamp(w["week_start"].iloc[k]), float(y[:k].mean()), float(y[k:].mean())


def main():
    t = targets.load()
    g = t["gold"]
    con = duckdb.connect(str(targets.LOCAL_DB))
    w = con.execute(f"SELECT * FROM {g}.comp_week WHERE days = 7 ORDER BY week_start").df()
    cw, before_rate, after_rate = change_week(w)

    m = con.execute(f"SELECT * FROM {g}.comp_tier_month").df()
    m["month_start"] = pd.to_datetime(m["period_month"] + "-01")
    m["month_end"] = m["month_start"] + pd.offsets.MonthEnd(0)
    m["period"] = np.where(m["month_end"] < cw, "before",
                           np.where(m["month_start"] > cw + pd.Timedelta(days=6), "after", "transition"))
    n_months = m[m.period != "transition"].groupby("period")["period_month"].nunique()

    agg = (m[m.period != "transition"].groupby(["period", "opening_tier"])
           [["theo_usd", "comp_cost_usd", "comps_redeemed", "visits", "players_with_play", "comp_face_usd",
             "points_redeemed"]].sum().reset_index())
    agg["months"] = agg["period"].map(n_months)
    agg["reinvestment"] = agg["comp_cost_usd"] / agg["theo_usd"]
    agg["visits_per_player_month"] = agg["visits"] / agg["players_with_play"]
    agg["comps_per_player_month"] = agg["comps_redeemed"] / agg["players_with_play"]
    agg["theo_per_player_month"] = agg["theo_usd"] / agg["players_with_play"]
    agg["points_per_comp_face_usd"] = agg["points_redeemed"] / agg["comp_face_usd"]

    piv = agg.pivot(index="opening_tier", columns="period")
    rows = []
    for tier in piv.index:
        r = {"opening_tier": tier}
        for col in ("reinvestment", "visits_per_player_month", "comps_per_player_month", "theo_per_player_month",
                    "points_per_comp_face_usd"):
            r[f"{col}_before"] = piv.loc[tier, (col, "before")]
            r[f"{col}_after"] = piv.loc[tier, (col, "after")]
        r["theo_share_before"] = piv.loc[tier, ("theo_usd", "before")] / piv[("theo_usd", "before")].sum()
        r["theo_share_after"] = piv.loc[tier, ("theo_usd", "after")] / piv[("theo_usd", "after")].sum()
        rows.append(r)
    out = pd.DataFrame(rows)

    tot = agg.groupby("period")[["comp_cost_usd", "theo_usd"]].sum()
    all_row = {
        "opening_tier": "All (actual mix)",
        "reinvestment_before": tot.loc["before", "comp_cost_usd"] / tot.loc["before", "theo_usd"],
        "reinvestment_after": tot.loc["after", "comp_cost_usd"] / tot.loc["after", "theo_usd"],
        "theo_share_before": 1.0, "theo_share_after": 1.0,
    }
    std_row = {
        "opening_tier": "All (after, re-weighted to before tier mix)",
        "reinvestment_before": all_row["reinvestment_before"],
        "reinvestment_after": float((out["reinvestment_after"] * out["theo_share_before"]).sum()),
        "theo_share_before": 1.0, "theo_share_after": 1.0,
    }
    out = pd.concat([out, pd.DataFrame([all_row, std_row])], ignore_index=True)
    out["change_week_start"] = cw.date()
    out["weekly_points_per_comp_usd_before"] = before_rate
    out["weekly_points_per_comp_usd_after"] = after_rate
    out["before_months"] = ", ".join(sorted(m.loc[m.period == "before", "period_month"].unique()))
    out["after_months"] = ", ".join(sorted(m.loc[m.period == "after", "period_month"].unique()))

    con.execute(f"CREATE OR REPLACE TABLE {g}.comp_change AS SELECT * FROM out")
    con.close()
    from royale import dbx
    dbx.write_table(out, f"{targets.prefixes('databricks')['gold']}.comp_change", targets.volume_root())
    pd.set_option("display.width", 200)
    print(f"change week starts {cw.date()}: {before_rate:.2f} -> {after_rate:.2f} points per comp $ (face)")
    print(out[["opening_tier", "reinvestment_before", "reinvestment_after", "visits_per_player_month_before",
               "visits_per_player_month_after", "comps_per_player_month_before", "comps_per_player_month_after",
               "theo_share_before", "theo_share_after"]].round(4).to_string(index=False))


if __name__ == "__main__":
    main()

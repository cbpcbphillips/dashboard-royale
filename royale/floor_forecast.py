"""The guide's simple time-series route, and the decisions it informs (claim C31).

1. Whole-floor daily coin-in, frozen at Apr 30: "average by weekday" (Jan-Apr) vs "constant training mean",
   scored on May-Jun (MAE in dollars, bias, predictions vs actuals). Nothing after Apr 30 is used.
2. Staffing: faults per shift-day forecast the same way (Jan-Apr weekday x shift averages, checked on May-Jun),
   then July's expected night-shift load with its one tech vs what an extra tech would save.
3. July baseline: the weekday forecast refit on Jan-Jun gives each July day's expected coin-in without a
   promotion: the yardstick for the two promotion weekends (Jul 18-20, 25-27).

Run: uv run python -m royale.floor_forecast [--no-databricks]
Writes gold.floor_forecast_metrics, gold.floor_forecast_daily, gold.fault_forecast_shift (DuckDB + Databricks).
"""
from __future__ import annotations

import argparse

import duckdb
import numpy as np
import pandas as pd

from royale import targets

TRAIN_END, TEST_START = pd.Timestamp("2025-04-30"), pd.Timestamp("2025-05-01")
PROMO_DAYS = pd.to_datetime(["2025-07-18", "2025-07-19", "2025-07-20", "2025-07-25", "2025-07-26", "2025-07-27"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    args = ap.parse_args()
    t = targets.load()
    g, b = t["gold"], t["bronze"]
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    f = con.execute(f"""SELECT f.gaming_date, f.coin_in_usd AS coin, c.local_weekday AS wd FROM {g}.floor_day f
                        JOIN {b}.calendar_day c ON c.gaming_date = f.gaming_date ORDER BY 1""").df()
    sh = con.execute(f"""SELECT t.gaming_date, t.shift, t.faults, t.planned_techs, t.actual_techs, t.wait_hours, c.local_weekday AS wd
                         FROM {g}.tech_shift_day t JOIN {b}.calendar_day c ON c.gaming_date = t.gaming_date""").df()
    lost_per_down_hour = con.execute(f"SELECT SUM(lost_theo_usd) / SUM(down_hours) FROM {g}.downtime_machine_day").fetchone()[0]
    con.close()
    f["gaming_date"] = pd.to_datetime(f["gaming_date"])
    sh["gaming_date"] = pd.to_datetime(sh["gaming_date"])

    # 1. frozen floor forecasts
    tr, te = f[f.gaming_date <= TRAIN_END], f[f.gaming_date >= TEST_START].copy()
    te["weekday_avg"] = te.wd.map(tr.groupby("wd").coin.mean())
    te["constant_mean"] = tr.coin.mean()
    mets = []
    for k, label in (("weekday_avg", "Average by weekday (Jan–Apr)"), ("constant_mean", "Constant Jan–Apr daily mean")):
        err = te[k] - te.coin
        mets.append({"forecast": k, "label": label, "mae_usd_per_day": float(err.abs().mean()), "bias_usd_per_day": float(err.mean()),
                     "mape": float((err.abs() / te.coin).mean()), "days": len(te)})
    mets = pd.DataFrame(mets)
    rng = np.random.default_rng(7)
    a, c = (te.weekday_avg - te.coin).abs().to_numpy(), (te.constant_mean - te.coin).abs().to_numpy()
    d = [(a[i] - c[i]).mean() for i in (rng.integers(0, len(a), len(a)) for _ in range(2000))]
    mets["diff_vs_constant"] = [float((a - c).mean()), 0.0]
    mets["diff_lo"], mets["diff_hi"] = [float(np.percentile(d, 2.5)), 0.0], [float(np.percentile(d, 97.5)), 0.0]

    # 3. July: the weekday forecast refit on Jan-Jun, as the promotion's no-promotion baseline
    wd_all = f.groupby("wd").coin.mean()
    july = pd.DataFrame({"gaming_date": pd.date_range("2025-07-01", "2025-07-30")})
    july["wd"] = july.gaming_date.dt.day_name().str[:3]
    july["forecast"] = july.wd.map(wd_all)
    july["promo"] = july.gaming_date.isin(PROMO_DAYS)
    daily = pd.concat([
        te[["gaming_date", "coin", "weekday_avg", "constant_mean"]].assign(part="test"),
        july[["gaming_date", "forecast", "promo"]].rename(columns={"forecast": "july_forecast"}).assign(part="july"),
    ], ignore_index=True)
    daily["gaming_date"] = daily.gaming_date.dt.date

    # 2. staffing: faults per shift-day by weekday x shift, frozen at Apr 30, checked on May-Jun
    s_tr, s_te = sh[sh.gaming_date <= TRAIN_END], sh[sh.gaming_date >= TEST_START].copy()
    s_te["pred"] = s_te.set_index(["wd", "shift"]).index.map(s_tr.groupby(["wd", "shift"]).faults.mean())
    fault_mae = float((s_te.pred - s_te.faults).abs().mean())
    fault_mae_flat = float((s_tr.faults.mean() - s_te.faults).abs().mean())
    shift = (sh.groupby("shift").agg(faults_per_day=("faults", "mean"), planned_techs=("planned_techs", "mean"),
                                     wait_h=("wait_hours", lambda x: x.sum()), faults=("faults", "sum"))
             .assign(avg_wait_h=lambda x: x.wait_h / x.faults).drop(columns=["wait_h", "faults"]).reset_index())
    july_faults = shift.set_index("shift").faults_per_day * 30
    best_wait = shift.avg_wait_h.min()
    shift["july_faults"] = shift["shift"].map(july_faults)
    # an extra tech brings this shift's wait down to the best-staffed shift's level, valued at lost earnings per down hour
    shift["extra_tech_saves_usd"] = shift.july_faults * (shift.avg_wait_h - best_wait).clip(lower=0) * lost_per_down_hour
    shift["extra_tech_cost_usd"] = 11520.0
    shift["fault_forecast_mae"], shift["fault_forecast_mae_flat"] = fault_mae, fault_mae_flat

    pd.set_option("display.width", 200)
    print(mets.round(3).to_string(index=False)); print(shift.round(2).to_string(index=False))
    print("promo-day baseline:", july[july.promo][["gaming_date", "wd", "forecast"]].round(0).to_string(index=False))

    tables = {"floor_forecast_metrics": mets, "floor_forecast_daily": daily, "fault_forecast_shift": shift}
    con = duckdb.connect(str(targets.LOCAL_DB))
    for name, df in tables.items():
        con.register("df_tmp", df)
        con.execute(f"CREATE OR REPLACE TABLE {g}.{name} AS SELECT * FROM df_tmp")
        con.unregister("df_tmp")
    con.close()
    if not args.no_databricks:
        from royale import dbx
        gold = targets.prefixes("databricks")["gold"]
        for name, df in tables.items():
            dbx.write_table(df, f"{gold}.{name}", targets.volume_root())
        print("wrote", ", ".join(tables), "to Databricks")


if __name__ == "__main__":
    main()

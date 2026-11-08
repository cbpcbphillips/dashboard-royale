"""A fairer simple baseline for the model test: "same as before, by weekday" (seasonal naive).

The frozen-forecast test (royale/model_run.py, claim C14) compares the model with two flat guesses. A flat guess
can't follow the weekly rhythm, so the model's day-level win could be "just the weekday pattern". This adds the
standard seasonal-naive baseline:

    prediction(machine, day) = machine's own Jan-Apr earning rate x floor weekday factor (Jan-Apr)
    floor weekday factor     = floor rate on that weekday / floor rate overall (ratio of sums, Jan-Apr only)

Nothing from May-June is used. Scored on exactly the same May-June machine-days as the other methods
(gold.model_predictions, target tpah), with the same metrics and a 2,000-rep machine bootstrap for the difference.

Writes gold.model_weekday_baseline (summary) and gold.model_weekday_daily (whole-floor daily series) to DuckDB and
Databricks, and logs MLflow run "tpah-weekday-persistence" in the royale-tpah experiment.
Run: uv run python -m royale.model_weekday [--no-databricks]
"""
from __future__ import annotations

import argparse

import duckdb
import mlflow
import numpy as np
import pandas as pd

from royale import dbx, model as M, targets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-databricks", action="store_true")
    args = ap.parse_args()
    g = targets.load()["gold"]

    days, _ = M.load_days()
    train = days[days.gaming_date <= M.TRAIN_END]
    col = M.TARGETS["tpah"]
    mach = train.groupby("machine_id")[[col, "available_hours"]].sum()
    mach_rate = (mach[col] / mach["available_hours"]).rename("mach_rate")
    floor_rate = train[col].sum() / train["available_hours"].sum()
    wd = train.groupby("local_weekday")[[col, "available_hours"]].sum()
    wd_factor = (wd[col] / wd["available_hours"] / floor_rate).rename("wd_factor")

    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    test = con.execute(f"SELECT * FROM {g}.model_predictions WHERE target = 'tpah'").df()
    con.close()
    test["gaming_date"] = pd.to_datetime(test["gaming_date"])
    test = test.merge(days[["machine_id", "gaming_date", "local_weekday"]], on=["machine_id", "gaming_date"], how="left")
    test = test.join(mach_rate, on="machine_id").join(wd_factor, on="local_weekday")
    # no Jan-Apr history (new machines): fall back to the zone x game guess, like the flat persistence baseline
    test["pred_weekday"] = test["mach_rate"].fillna(test["pred_zone_game"]) * test["wd_factor"]
    assert test["pred_weekday"].notna().all()

    methods = {"pred_model": "GLM + machine effect", "pred_persistence": "Same as before (flat)", "pred_weekday": "Same as before, by weekday"}
    h = test["available_hours"]
    per = test.assign(**{f"{k}_h": test[k] * h for k in [*methods, "actual"]}).groupby("machine_id").sum(numeric_only=True)
    per_rate = {k: per[f"{k}_h"] / per["available_hours"] for k in [*methods, "actual"]}
    day_mae = {k: float(np.abs(test[k] - test["actual"]).mean()) for k in methods}
    per_mae = {k: float(np.abs(per_rate[k] - per_rate["actual"]).mean()) for k in methods}

    # bootstrap over machines: model minus weekday baseline, day level and two-month level
    rng = np.random.default_rng(7)
    ids = per.index.to_numpy()
    err_d = test.assign(e_m=np.abs(test.pred_model - test.actual), e_w=np.abs(test.pred_weekday - test.actual)).groupby("machine_id")[["e_m", "e_w"]].agg(["sum", "count"])
    e_pm, e_pw = np.abs(per_rate["pred_model"] - per_rate["actual"]).to_numpy(), np.abs(per_rate["pred_weekday"] - per_rate["actual"]).to_numpy()
    sm, sw, n = err_d[("e_m", "sum")].reindex(ids).to_numpy(), err_d[("e_w", "sum")].reindex(ids).to_numpy(), err_d[("e_m", "count")].reindex(ids).to_numpy()
    bd, bp = [], []
    for _ in range(2000):
        i = rng.integers(0, len(ids), len(ids))
        bd.append(sm[i].sum() / n[i].sum() - sw[i].sum() / n[i].sum())
        bp.append(e_pm[i].mean() - e_pw[i].mean())
    summary = pd.DataFrame([{
        "target": "tpah", "baseline": "pred_weekday", "label": methods["pred_weekday"],
        "mae_machine_day_weekday": day_mae["pred_weekday"], "mae_machine_period_weekday": per_mae["pred_weekday"],
        "mae_machine_day_model": day_mae["pred_model"], "mae_machine_period_model": per_mae["pred_model"],
        "mae_machine_day_flat": day_mae["pred_persistence"], "mae_machine_period_flat": per_mae["pred_persistence"],
        "day_diff_model_minus_weekday": day_mae["pred_model"] - day_mae["pred_weekday"],
        "day_diff_lo": float(np.percentile(bd, 2.5)), "day_diff_hi": float(np.percentile(bd, 97.5)),
        "period_diff_model_minus_weekday": per_mae["pred_model"] - per_mae["pred_weekday"],
        "period_diff_lo": float(np.percentile(bp, 2.5)), "period_diff_hi": float(np.percentile(bp, 97.5)),
        "machines": len(per), "machine_days": len(test),
        "weekday_factors": ", ".join(f"{k}:{v:.3f}" for k, v in wd_factor.items()),
    }])
    daily = (test.assign(x=test.pred_weekday * h).groupby(test.gaming_date.dt.date)
             .apply(lambda x: x["x"].sum() / x["available_hours"].sum(), include_groups=False).rename("weekday").reset_index())

    run_id = None
    if not args.no_databricks:
        user = dbx.client().current_user.me().user_name
        mlflow.set_tracking_uri(f"databricks://{dbx.PROFILE}")
        mlflow.set_experiment(f"/Users/{user}/royale-tpah")
        with mlflow.start_run(run_name="tpah-weekday-persistence") as r:
            mlflow.set_tags({"target": "tpah", "method": methods["pred_weekday"], "purpose": "fairer simple baseline (seasonal naive)"})
            mlflow.log_params({"train_window": "2025-01-01..2025-04-30", "test_window": "2025-05-01..2025-06-30",
                               "rule": "machine Jan-Apr rate x floor weekday factor (Jan-Apr)"})
            mlflow.log_metrics({k: float(v) for k, v in summary.iloc[0].items() if isinstance(v, (int, float, np.floating)) and k != "machines"})
            run_id = r.info.run_id
    summary["mlflow_run_id"] = run_id

    con = duckdb.connect(str(targets.LOCAL_DB))
    for name, df in {"model_weekday_baseline": summary, "model_weekday_daily": daily}.items():
        con.register("df_tmp", df)
        con.execute(f"CREATE OR REPLACE TABLE {g}.{name} AS SELECT * FROM df_tmp")
        con.unregister("df_tmp")
    con.close()
    if not args.no_databricks:
        gold = targets.prefixes("databricks")["gold"]
        dbx.write_table(summary, f"{gold}.model_weekday_baseline", targets.volume_root())
        dbx.write_table(daily, f"{gold}.model_weekday_daily", targets.volume_root())
    pd.set_option("display.width", 200)
    print(summary.T.to_string())


if __name__ == "__main__":
    main()

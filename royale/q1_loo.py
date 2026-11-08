"""Q1 leave-one-out expectation (docs/Q1.md, D-061, D-062, D-072).

For every machine: fit the exposure-weighted Poisson GLM on ALL OTHER machines and predict what this
machine should have kept (theo) on each of its days, from its spot (bank, zone), its game, the game in
this zone (when >= 3 other same-game units are in the zone), weekday, holidays, events and the Back
Forty walkway closure. Maker and lease class are left out on purpose: they belong to the unit.

Outputs gold.q1_expected_day (machine-day expected theo) on DuckDB and Databricks, and logs an MLflow run.
Run: uv run python -m royale.q1_loo
"""
from __future__ import annotations

import time

import duckdb
import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from royale import model as M
from royale import targets

ALPHA = 0.03            # chosen on the inner Jan-Mar -> Apr split (D-032)
MIN_ZONE_GAME_PEERS = 3  # D-072
CATS = ["zone_id", "bank_id", "config_id", "zone_game", "local_weekday"]
NUMS = ["is_holiday", "ev_major_weekend", "ev_convention", "ev_property_promo", "b40_walkway_closed"]


def frame() -> pd.DataFrame:
    days, ev = M.load_days()
    d = M.add_event_flags(days, ev, known_by=pd.Timestamp("2025-12-31"))  # descriptive: all events count
    d["zone_game"] = d["zone_id"] + "|" + d["config_id"]
    return d


def make_glm() -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATS),   # sparse
        ("num", "passthrough", NUMS),
    ])
    return Pipeline([("pre", pre), ("glm", PoissonRegressor(alpha=ALPHA, max_iter=300))])


def one(d: pd.DataFrame, mid: str, cell_counts: pd.Series) -> pd.DataFrame:
    train = d[d.machine_id != mid]
    test = d[d.machine_id == mid].copy()
    # game-in-zone counts as part of the spot only when enough OTHER same-game units are in the zone
    cell = test["zone_game"].iloc[-1]
    others = cell_counts.get(cell, 0) - 1
    if others < MIN_ZONE_GAME_PEERS:
        test["zone_game"] = "__too_few_peers__"
    glm = make_glm().fit(train[CATS + NUMS], train["theo_usd"] / train["available_hours"],
                         glm__sample_weight=train["available_hours"])
    rate = glm.predict(test[CATS + NUMS])
    return pd.DataFrame({"machine_id": mid, "gaming_date": test["gaming_date"].dt.date,
                         "expected_rate": rate, "expected_theo_usd": rate * test["available_hours"],
                         "zone_game_used": others >= MIN_ZONE_GAME_PEERS})


def main():
    t0 = time.time()
    d = frame()
    cell_counts = d.groupby("zone_game")["machine_id"].nunique()
    mids = sorted(d.machine_id.unique())
    parts = Parallel(n_jobs=-1, verbose=0)(delayed(one)(d, m, cell_counts) for m in mids)
    out = pd.concat(parts, ignore_index=True)
    print(f"leave-one-out fits: {len(mids)} machines in {time.time() - t0:.0f}s; rows {len(out):,}")

    g = targets.load()["gold"]
    con = duckdb.connect(str(targets.LOCAL_DB))
    con.register("x", out)
    con.execute(f"CREATE OR REPLACE TABLE {g}.q1_expected_day AS SELECT * FROM x")
    chk = con.execute(f"""SELECT SUM(e.expected_theo_usd) / SUM(m.theo_usd) AS ratio, COUNT(*) AS n
                          FROM {g}.q1_expected_day e JOIN {g}.machine_day m USING (machine_id, gaming_date)""").fetchone()
    con.close()
    print(f"floor check: expected / actual theo = {chk[0]:.4f} over {chk[1]:,} machine-days (should be ~1)")

    from royale import dbx
    dbx.write_table(out, f"{targets.prefixes('databricks')['gold']}.q1_expected_day", targets.volume_root())
    print("databricks: gold.q1_expected_day written")

    import mlflow
    user = dbx.client().current_user.me().user_name
    mlflow.set_tracking_uri(f"databricks://{dbx.PROFILE}")
    mlflow.set_experiment(f"/Users/{user}/royale-tpah")
    with mlflow.start_run(run_name="q1-leave-one-out-expectation") as r:
        mlflow.set_tags({"stage": "Q1", "purpose": "leave-one-out expected theo per machine-day (docs/Q1.md)"})
        mlflow.log_params({"alpha": ALPHA, "features_categorical": ",".join(CATS), "features_numeric": ",".join(NUMS),
                           "min_zone_game_peers": MIN_ZONE_GAME_PEERS, "fit_window": "2025-01-01..2025-06-30",
                           "machines": len(mids), "excluded_unit_features": "manufacturer,lease_class"})
        mlflow.log_metrics({"floor_expected_over_actual": float(chk[0]),
                            "share_machines_using_zone_game": float(out.groupby("machine_id").zone_game_used.first().mean())})
        print("mlflow run", r.info.run_id)


if __name__ == "__main__":
    main()

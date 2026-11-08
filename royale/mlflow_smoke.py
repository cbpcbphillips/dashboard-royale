"""Create the MLflow experiment in Databricks and log one tagged smoke-test run.

Run: uv run python -m royale.mlflow_smoke
"""
import json

import mlflow

from royale import dbx, targets


def main():
    user = dbx.client().current_user.me().user_name
    mlflow.set_tracking_uri(f"databricks://{dbx.PROFILE}")
    experiment = f"/Users/{user}/royale-tpah"
    mlflow.set_experiment(experiment)
    manifest = json.loads(targets.MANIFEST.read_text())
    with mlflow.start_run(run_name="setup-smoke-test", tags={"purpose": "Stage A2 setup check, not a model"}) as run:
        mlflow.log_params({"stage": "A2", "data_release": manifest.get("release", manifest.get("version", "unknown"))})
        mlflow.log_metric("ok", 1)
    print(f"experiment {experiment} run {run.info.run_id}")


if __name__ == "__main__":
    main()

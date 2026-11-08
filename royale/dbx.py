"""Databricks connection helpers. Auth comes from the CLI profile created by
`databricks auth login --profile royale` (browser OAuth); no tokens in code."""
import os
import shutil
from contextlib import contextmanager
from pathlib import Path

import pandas as pd
from databricks import sql as dbsql
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

PROFILE = "royale"

# The SDK gets OAuth tokens by calling the `databricks` CLI. Shells opened before the winget
# install don't have it on PATH yet, so point the SDK at the winget location if needed.
_WINGET_CLI = (Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
               / "Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe" / "databricks.exe")
if not shutil.which("databricks") and "DATABRICKS_CLI_PATH" not in os.environ and _WINGET_CLI.exists():
    os.environ["DATABRICKS_CLI_PATH"] = str(_WINGET_CLI)


def client() -> WorkspaceClient:
    return WorkspaceClient(profile=PROFILE)


def warehouse_id(w: WorkspaceClient | None = None) -> str:
    w = w or client()
    warehouses = list(w.warehouses.list())
    if not warehouses:
        raise RuntimeError("No SQL warehouse found in the workspace")
    return warehouses[0].id


@contextmanager
def connect():
    """Session-based SQL connection to the warehouse, pinned to UTC."""
    cfg = Config(profile=PROFILE)
    w = WorkspaceClient(config=cfg)
    conn = dbsql.connect(
        server_hostname=cfg.host.removeprefix("https://").rstrip("/"),
        http_path=f"/sql/1.0/warehouses/{warehouse_id(w)}",
        credentials_provider=lambda: cfg.authenticate,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SET TIME ZONE 'UTC'")
        yield conn
    finally:
        conn.close()


def write_table(df: pd.DataFrame, fq_table: str, volume_root: str) -> None:
    """Replace a Delta table with a pandas frame (via a parquet file in the Volume)."""
    from royale import targets
    name = fq_table.split(".")[-1]
    local = targets.ROOT / "local" / "exports" / f"{name}.parquet"
    local.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(local, index=False)
    remote = f"{volume_root}/derived/{name}.parquet"
    with open(local, "rb") as fh:
        client().files.upload(remote, fh, overwrite=True)
    with connect() as conn:
        run(conn, f"CREATE OR REPLACE TABLE {fq_table} AS SELECT * FROM parquet.`{remote}`")


def run(conn, statement: str) -> pd.DataFrame | None:
    with conn.cursor() as cur:
        cur.execute(statement)
        if cur.description is None:
            return None
        return cur.fetchall_arrow().to_pandas()

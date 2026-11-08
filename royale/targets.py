"""Where tables live in each engine (decision D-017).

Shared SQL refers to `${bronze}.machine_day`, `${silver}.x`, `${gold}.y`. Each engine maps
those placeholders to its own prefix, so the SQL text is identical on DuckDB and Databricks.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MANIFEST = DATA / "manifest.json"
TARGETS_FILE = ROOT / "royale" / "targets.json"
LOCAL_DB = ROOT / "local" / "royale.duckdb"

PRIMARY = {"catalog": "royale", "raw": "raw", "bronze": "bronze", "silver": "silver", "gold": "gold"}
FALLBACK = {"catalog": "workspace", "raw": "royale_raw", "bronze": "royale_bronze",
            "silver": "royale_silver", "gold": "royale_gold"}
VOLUME = "files"
LAYERS = ("bronze", "silver", "gold")


def load() -> dict:
    """Names chosen by setup_catalog (PRIMARY until setup has run)."""
    if TARGETS_FILE.exists():
        return json.loads(TARGETS_FILE.read_text())
    return dict(PRIMARY)


def save(targets: dict) -> None:
    TARGETS_FILE.write_text(json.dumps(targets, indent=2) + "\n")


def volume_root(t: dict | None = None) -> str:
    t = t or load()
    return f"/Volumes/{t['catalog']}/{t['raw']}/{VOLUME}"


def prefixes(engine: str, t: dict | None = None) -> dict:
    """Placeholder -> table prefix for an engine ('duckdb' or 'databricks')."""
    t = t or load()
    if engine == "databricks":
        return {layer: f"{t['catalog']}.{t[layer]}" for layer in LAYERS}
    if engine == "duckdb":
        return {layer: t[layer] for layer in LAYERS}
    raise ValueError(engine)


def parquet_entries() -> list[dict]:
    """Manifest entries for the parquet files, with the table name each one becomes."""
    manifest = json.loads(MANIFEST.read_text())
    out = []
    for e in manifest["files"]:
        if e["path"].endswith(".parquet"):
            out.append({**e, "table": Path(e["path"]).stem})
    return out

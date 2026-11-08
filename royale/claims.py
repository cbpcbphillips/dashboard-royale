"""Re-run claim queries (sql/claims/*.sql) and print results, on DuckDB or Databricks.

Run: uv run python -m royale.claims [C01 C02 ...] [--engine duckdb|databricks]
     uv run python -m royale.claims --export   (writes web/data/claims.json from docs/claims.md for the app)
"""
import argparse
import json
from pathlib import Path

import duckdb

from royale import targets
from royale.sqlrun import render

CLAIMS = targets.ROOT / "sql" / "claims"
FIELDS = ["id", "claim", "query", "result", "alternative", "limitation", "used_in"]


def export() -> None:
    """Verified-claims table in docs/claims.md -> web/data/claims.json (the app's Evidence list)."""
    text = (targets.ROOT / "docs" / "claims.md").read_text(encoding="utf-8")
    section = text.split("## Verified claims", 1)[1].split("\n## ", 1)[0]
    rows = []
    for line in section.splitlines():
        if not line.startswith("| C"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split(" | ")]
        assert len(cells) == len(FIELDS), (cells[0], len(cells))
        rows.append(dict(zip(FIELDS, cells)))
    rows.sort(key=lambda r: int(r["id"][1:]))
    out = targets.ROOT / "web" / "data" / "claims.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out}: {len(rows)} claims ({rows[0]['id']}..{rows[-1]['id']})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--engine", choices=["duckdb", "databricks"], default="duckdb")
    ap.add_argument("--export", action="store_true", help="write web/data/claims.json and exit")
    a = ap.parse_args()
    if a.export:
        return export()
    files = sorted(p for p in CLAIMS.glob("C*.sql") if not a.ids or p.name.split("_")[0] in a.ids)
    if a.engine == "duckdb":
        con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
        run = lambda s: con.execute(s).df()
    else:
        from royale import dbx
        ctx = dbx.connect(); conn = ctx.__enter__()
        run = lambda s: dbx.run(conn, s)
    for f in files:
        print(f"\n== {f.name} ({a.engine})")
        for stmt in render(f, a.engine):
            print(run(stmt).to_string(index=False))


if __name__ == "__main__":
    main()

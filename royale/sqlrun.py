"""Run a shared SQL file on DuckDB, Databricks, or both (D-018).

SQL files use ${bronze} / ${silver} / ${gold} placeholders; statements are separated by ';'
at the end of a line. Run: uv run python -m royale.sqlrun sql/silver/x.sql --engine both
"""
import argparse
import re
from pathlib import Path
from string import Template

import duckdb

from royale import targets


def render(path: str | Path, engine: str) -> list[str]:
    text = Template(Path(path).read_text()).substitute(targets.prefixes(engine))
    text = re.sub(r"--[^\n]*", "", text)  # drop line comments (a ';' inside one would split a statement)
    return [s.strip() for s in re.split(r";\s*\n", text + "\n") if s.strip()]


def run_duckdb(path):
    con = duckdb.connect(str(targets.LOCAL_DB))
    for stmt in render(path, "duckdb"):
        con.execute(stmt)
    con.close()
    print(f"duckdb: ran {path}")


def run_databricks(path):
    from royale import dbx
    with dbx.connect() as conn:
        for stmt in render(path, "databricks"):
            dbx.run(conn, stmt)
    print(f"databricks: ran {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--engine", choices=["databricks", "duckdb", "both"], default="both")
    a = ap.parse_args()
    for f in a.files:
        if a.engine in ("duckdb", "both"):
            run_duckdb(f)
        if a.engine in ("databricks", "both"):
            run_databricks(f)


if __name__ == "__main__":
    main()

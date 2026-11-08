"""Bronze layer on both engines: one table per released parquet file, unchanged.

Databricks: Delta table via CTAS from the Volume. DuckDB: view over the local parquet file.
Run: uv run python -m royale.create_bronze [--engine databricks|duckdb|both]
"""
import argparse

import duckdb

from royale import targets


def build_duckdb():
    t = targets.load()
    targets.LOCAL_DB.parent.mkdir(exist_ok=True)
    con = duckdb.connect(str(targets.LOCAL_DB))
    for layer in targets.LAYERS:
        con.execute(f"CREATE SCHEMA IF NOT EXISTS {t[layer]}")
    for e in targets.parquet_entries():
        path = (targets.DATA / e["path"]).as_posix()
        con.execute(f"CREATE OR REPLACE VIEW {t['bronze']}.\"{e['table']}\" AS "
                    f"SELECT * FROM read_parquet('{path}')")
    n = con.execute("SELECT count(*) FROM duckdb_views() WHERE schema_name = ?", [t["bronze"]]).fetchone()[0]
    con.close()
    print(f"duckdb: {n} bronze views in {targets.LOCAL_DB}")


def build_databricks():
    from royale import dbx
    t = targets.load()
    prefix = targets.prefixes("databricks", t)["bronze"]
    root = targets.volume_root(t)
    with dbx.connect() as conn:
        for e in targets.parquet_entries():
            comment = f"Source: data/{e['path']} sha256={e['sha256']} rows={e['rows']}"
            dbx.run(conn, f"CREATE OR REPLACE TABLE {prefix}.`{e['table']}` COMMENT '{comment}' "
                          f"AS SELECT * FROM parquet.`{root}/{e['path']}`")
            print(f"databricks: {prefix}.{e['table']}")
        n = dbx.run(conn, f"SHOW TABLES IN {prefix}").shape[0]
    print(f"databricks: {n} bronze tables in {prefix}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["databricks", "duckdb", "both"], default="both")
    engine = ap.parse_args().engine
    if engine in ("duckdb", "both"):
        build_duckdb()
    if engine in ("databricks", "both"):
        build_databricks()


if __name__ == "__main__":
    main()

"""Create catalog, schemas and the raw Volume (D-017: try `royale`, fall back to `workspace`).

Run: uv run python -m royale.setup_catalog
"""
from royale import dbx, targets


def main():
    with dbx.connect() as conn:
        print("whoami:", dbx.run(conn, "SELECT current_user() AS u").iloc[0, 0])
        chosen = dict(targets.PRIMARY)
        try:
            dbx.run(conn, f"CREATE CATALOG IF NOT EXISTS {chosen['catalog']} "
                          "COMMENT 'Dashboard Royale (TAMU Datathon) - synthetic casino data'")
            print("catalog 'royale' OK")
        except Exception as exc:  # Free Edition may block new catalogs
            print(f"CREATE CATALOG royale failed -> fallback to 'workspace': {str(exc)[:300]}")
            chosen = dict(targets.FALLBACK)
        c = chosen["catalog"]
        for layer in ("raw", "bronze", "silver", "gold"):
            dbx.run(conn, f"CREATE SCHEMA IF NOT EXISTS {c}.{chosen[layer]}")
        dbx.run(conn, f"CREATE VOLUME IF NOT EXISTS {c}.{chosen['raw']}.{targets.VOLUME} "
                      "COMMENT 'Parquet files exactly as released (data/manifest.json)'")
        targets.save(chosen)
        print("schemas:", dbx.run(conn, f"SHOW SCHEMAS IN {c}").iloc[:, 0].tolist())
        print("volume root:", targets.volume_root(chosen))


if __name__ == "__main__":
    main()

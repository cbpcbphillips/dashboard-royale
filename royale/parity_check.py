"""Prove Databricks tables match local DuckDB tables, column by column.

Per table: row count; per column: non-null count, SUM for numbers, true-count for booleans,
distinct count for text, min/max for dates and timestamps (catches time-zone shifts).
Writes docs/evidence/parity.md. Run: uv run python -m royale.parity_check [--layer bronze]
"""
import argparse
import datetime as dt
import math
from decimal import Decimal

import duckdb

from royale import dbx, targets

NUMERIC = ("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "FLOAT", "DOUBLE", "DECIMAL")


def aggregates(columns: list[tuple[str, str]], q) -> list[tuple[str, str, str]]:
    """(label, kind, sql expression) for each check. q() quotes an identifier."""
    out = [("rows", "num", "count(*)")]
    for name, typ in columns:
        c = q(name)
        out.append((f"{name}:nonnull", "num", f"count({c})"))
        if typ.startswith(NUMERIC):
            out.append((f"{name}:sum", "num", f"sum(CAST({c} AS DOUBLE))"))
        elif typ == "BOOLEAN":
            out.append((f"{name}:true", "num", f"sum(CASE WHEN {c} THEN 1 ELSE 0 END)"))
        elif typ.startswith(("TIMESTAMP", "DATE")):
            out.append((f"{name}:min", "time", f"min({c})"))
            out.append((f"{name}:max", "time", f"max({c})"))
        elif typ == "VARCHAR":
            out.append((f"{name}:distinct", "num", f"count(DISTINCT {c})"))
    return out


def norm(value, kind):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if kind == "time":
        if hasattr(value, "to_pydatetime"):
            value = value.to_pydatetime()
        if isinstance(value, dt.datetime):
            if value.tzinfo is not None:
                value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
            return value.isoformat(sep=" ")
        return value.isoformat()
    return float(value) if isinstance(value, (int, float, Decimal)) else value


def same(a, b, kind):
    if a is None or b is None:
        return a is b
    if kind == "num":
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-6)
    return a == b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", default="bronze", choices=list(targets.LAYERS))
    layer = ap.parse_args().layer
    duck_prefix = targets.prefixes("duckdb")[layer]
    dbx_prefix = targets.prefixes("databricks")[layer]

    duck = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    tables = [r[0] for r in duck.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY 1",
        [duck_prefix]).fetchall()]

    rows, failures = [], []
    with dbx.connect() as conn:
        remote = set(dbx.run(conn, f"SHOW TABLES IN {dbx_prefix}")["tableName"])
        for table in tables:
            cols = [(r[0], r[1]) for r in duck.execute(f'DESCRIBE {duck_prefix}."{table}"').fetchall()]
            if table not in remote:
                failures.append(f"{table}: missing on Databricks")
                rows.append((table, "-", 0, "FAIL: missing"))
                continue
            dcols = dbx.run(conn, f"DESCRIBE TABLE {dbx_prefix}.`{table}`")["col_name"].tolist()
            # DESCRIBE TABLE also returns metadata section headers ("# ...") and blank rows.
            extra = sorted({c for c in dcols if c and not c.startswith("#")} - {c for c, _ in cols})
            checks = aggregates(cols, lambda c: f'"{c}"')
            local = duck.execute("SELECT " + ", ".join(e for _, _, e in checks) +
                                 f' FROM {duck_prefix}."{table}"').fetchone()
            checks_r = aggregates(cols, lambda c: f"`{c}`")
            remote_vals = dbx.run(conn, "SELECT " + ", ".join(f"{e} AS c{i}" for i, (_, _, e) in enumerate(checks_r)) +
                                  f" FROM {dbx_prefix}.`{table}`").iloc[0].tolist()
            bad = [(label, norm(l, k), norm(r, k)) for (label, k, _), l, r in zip(checks, local, remote_vals)
                   if not same(norm(l, k), norm(r, k), k)]
            if extra:
                bad.append(("extra columns on Databricks", None, extra))
            status = "PASS" if not bad else "FAIL: " + "; ".join(f"{b[0]} local={b[1]} dbx={b[2]}" for b in bad[:3])
            if bad:
                failures.append(f"{table}: {status}")
            rows.append((table, int(local[0]), len(checks), status))
            print(f"{table:32s} rows={int(local[0]):>9,} checks={len(checks):>3} {status[:120]}")
    duck.close()

    out = targets.ROOT / "docs" / "evidence" / f"parity_{layer}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"# Parity check: `{layer}` layer, DuckDB (local parquet) vs Databricks (Delta)", "",
             f"Run: {dt.datetime.now().strftime('%Y-%m-%d %H:%M')} local time · Databricks prefix `{dbx_prefix}` · "
             f"command `uv run python -m royale.parity_check --layer {layer}`", "",
             "Checks per column: non-null count; SUM (numbers); true count (booleans); distinct count (text); "
             "min/max (dates, timestamps; Databricks session pinned to UTC).", "",
             "| Table | Rows | Checks | Result |", "|---|---:|---:|---|"]
    lines += [f"| {t} | {n:,} | {c} | {s} |" if isinstance(n, int) else f"| {t} | {n} | {c} | {s} |"
              for t, n, c, s in rows]
    lines += ["", f"**{len(tables) - len(failures)} of {len(tables)} tables match.**"]
    out.write_text("\n".join(lines) + "\n")
    print(f"\n{len(tables) - len(failures)}/{len(tables)} tables match -> {out}")


if __name__ == "__main__":
    main()

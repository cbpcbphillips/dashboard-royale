-- Engine helper (Databricks SQL UDF in Unity Catalog). The DuckDB twin is duckdb_functions.sql.
CREATE OR REPLACE FUNCTION ${gold}.secs_between(a TIMESTAMP_NTZ, b TIMESTAMP_NTZ)
RETURNS DOUBLE
COMMENT 'Seconds from a to b (shared-SQL helper)'
RETURN CAST(datediff(SECOND, a, b) AS DOUBLE);

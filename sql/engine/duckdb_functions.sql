-- Engine helper (DuckDB). The Databricks twin is databricks_functions.sql.
-- Shared SQL calls gold.secs_between(a, b) = seconds from a to b.
CREATE OR REPLACE MACRO ${gold}.secs_between(a, b) AS epoch(b) - epoch(a);

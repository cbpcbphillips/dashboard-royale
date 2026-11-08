-- C17: The Q1 leave-one-out prediction (royale/q1_loo.py) is right for the floor as a whole over the
-- six months, but it has no calendar term, so by month the floor runs above it (Feb-Mar) and below
-- it (May-Jun). That is why Q1 compares each machine on the same days (D-082).
-- ratio = actual theo / predicted theo (both luck-free), ratio of sums.
WITH d AS (
  SELECT m.gaming_date, m.theo_usd AS a, e.expected_theo_usd AS e
  FROM ${gold}.machine_day m
  JOIN ${gold}.q1_expected_day e ON e.machine_id = m.machine_id AND e.gaming_date = m.gaming_date
)
SELECT 'all' AS month, COUNT(*) AS machine_days, ROUND(SUM(a), 0) AS actual_theo_usd,
       ROUND(SUM(e), 0) AS predicted_theo_usd, ROUND(SUM(a) / SUM(e), 4) AS actual_vs_predicted
FROM d
UNION ALL
SELECT CAST(MONTH(gaming_date) AS STRING), COUNT(*), ROUND(SUM(a), 0), ROUND(SUM(e), 0), ROUND(SUM(a) / SUM(e), 4)
FROM d GROUP BY MONTH(gaming_date)
ORDER BY month;

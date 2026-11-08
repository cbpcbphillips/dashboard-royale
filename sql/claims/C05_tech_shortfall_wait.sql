-- C05: Fault repairs waited about twice as long in shifts that ran short of slot techs.
SELECT CASE WHEN short_staffed = 1 THEN 'short-staffed shift' ELSE 'fully staffed shift' END AS shift_staffing,
       COUNT(*) AS shifts,
       SUM(faults) AS faults,
       ROUND(SUM(faults) * 1.0 / COUNT(*), 2) AS faults_per_shift,
       ROUND(SUM(wait_hours) / NULLIF(SUM(faults), 0), 2) AS avg_wait_hours
FROM ${gold}.tech_shift_day
GROUP BY 1
ORDER BY 1;
SELECT month, shift, SUM(planned_techs) AS planned, SUM(actual_techs) AS actual, SUM(faults) AS faults,
       ROUND(SUM(wait_hours) / NULLIF(SUM(faults), 0), 2) AS avg_wait_hours
FROM (SELECT t.*, c.month FROM ${gold}.tech_shift_day AS t JOIN ${bronze}.calendar_day AS c ON c.gaming_date = t.gaming_date) AS x
GROUP BY month, shift
ORDER BY month, shift;

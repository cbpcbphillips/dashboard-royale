-- Q2: Back Forty vs rest of floor, before / during / after the walkway closure (input to the
-- difference-in-differences in claim C11).
CREATE OR REPLACE TABLE ${gold}.walkway_periods AS
WITH first_closed AS (SELECT MIN(gaming_date) AS d FROM ${gold}.zone_day WHERE walkway_closed = 1)
SELECT CASE WHEN z.zone_id = 'Z-B40' THEN 'Back Forty' ELSE 'Rest of floor' END AS area,
       CASE WHEN z.walkway_closed = 1 THEN '2 during closure'
            WHEN z.gaming_date < f.d THEN '1 before'
            ELSE '3 after reopening' END AS period,
       COUNT(DISTINCT z.gaming_date) AS days,
       SUM(z.occupied_hours) / SUM(z.available_hours) AS occupancy,
       SUM(z.coin_in_usd) / SUM(z.available_hours) AS cpah,
       SUM(z.theo_usd) / SUM(z.available_hours) AS tpah,
       SUM(z.entries_observed) / SUM(z.covered_sensor_hours) AS entries_per_covered_hour
FROM ${gold}.zone_day AS z
CROSS JOIN first_closed AS f
GROUP BY 1, 2;

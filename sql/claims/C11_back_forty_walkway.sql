-- C11: Back Forty gets far less foot traffic than other zones, and the walkway closure cut its
-- occupancy further (difference-in-differences vs the rest of the floor); it mostly recovered
-- after reopening but stayed well below the floor before, during and after.
SELECT area, period, days, ROUND(occupancy, 3) AS occupancy, ROUND(cpah, 1) AS coin_in_per_avail_hour,
       ROUND(entries_per_covered_hour, 1) AS entries_per_covered_sensor_hour
FROM ${gold}.walkway_periods
ORDER BY area, period;
WITH p AS (
    SELECT period,
           MAX(CASE WHEN area = 'Back Forty' THEN occupancy END) AS b40_occ,
           MAX(CASE WHEN area = 'Rest of floor' THEN occupancy END) AS rest_occ,
           MAX(CASE WHEN area = 'Back Forty' THEN entries_per_covered_hour END) AS b40_traffic,
           MAX(CASE WHEN area = 'Rest of floor' THEN entries_per_covered_hour END) AS rest_traffic
    FROM ${gold}.walkway_periods GROUP BY period
), b AS (SELECT * FROM p WHERE period = '1 before')
SELECT p.period,
       ROUND((p.b40_occ / b.b40_occ) / (p.rest_occ / b.rest_occ), 3) AS occupancy_did_ratio,
       ROUND((p.b40_traffic / b.b40_traffic) / (p.rest_traffic / b.rest_traffic), 3) AS traffic_did_ratio
FROM p CROSS JOIN b
ORDER BY p.period;

-- C02: Back Forty earns less per available hour than every other zone, and the gap holds
-- for the SAME game (so it is not game mix). Occupancy shows players sit there less.
SELECT config_id,
       ROUND(SUM(CASE WHEN zone_id = 'Z-B40' THEN theo_usd END) / SUM(CASE WHEN zone_id = 'Z-B40' THEN available_hours END), 2) AS back_forty_tpah,
       ROUND(SUM(CASE WHEN zone_id <> 'Z-B40' THEN theo_usd END) / SUM(CASE WHEN zone_id <> 'Z-B40' THEN available_hours END), 2) AS rest_of_floor_tpah,
       ROUND(SUM(CASE WHEN zone_id = 'Z-B40' THEN occupied_hours END) / SUM(CASE WHEN zone_id = 'Z-B40' THEN available_hours END), 3) AS back_forty_occupancy,
       ROUND(SUM(CASE WHEN zone_id <> 'Z-B40' THEN occupied_hours END) / SUM(CASE WHEN zone_id <> 'Z-B40' THEN available_hours END), 3) AS rest_of_floor_occupancy
FROM ${gold}.machine_day
GROUP BY config_id
HAVING SUM(CASE WHEN zone_id = 'Z-B40' THEN available_hours END) > 0
ORDER BY config_id;

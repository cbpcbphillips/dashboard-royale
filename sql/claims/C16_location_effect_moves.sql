-- C16: The model's location effect checks out on a real move: M-1152 moved from Back Forty to the
-- Main Entrance on Feb 4. A model fit WITHOUT that machine predicted its rate would rise 1.90x;
-- it actually rose 2.12x. One-way move what-ifs below assume a free slot (see empty slots).
SELECT machine_id, move_date, from_zone, to_zone, from_bank, to_bank, days_before, days_after,
       ROUND(actual_before, 2) AS actual_before, ROUND(actual_after, 2) AS actual_after,
       ROUND(actual_change, 3) AS actual_change, ROUND(predicted_change, 3) AS predicted_change
FROM ${gold}.model_move_check
ORDER BY move_date;
WITH empty AS (
    SELECT fl.zone_id, COUNT(*) - COUNT(md.machine_id) AS empty_slots_jun30
    FROM ${bronze}.floor_locations AS fl
    LEFT JOIN ${gold}.machine_day AS md ON md.location_id = fl.location_id AND md.gaming_date = DATE '2025-06-30'
    WHERE fl.node_type = 'slot'
    GROUP BY fl.zone_id
)
SELECT w.current_zone, w.dest_zone, e.empty_slots_jun30 AS dest_empty_slots,
       COUNT(*) AS machines_whose_best_move_is_here,
       SUM(CASE WHEN w.net_gain_30d > 0 THEN 1 ELSE 0 END) AS positive_one_way,
       ROUND(AVG(w.ratio), 2) AS avg_rate_ratio,
       ROUND(MAX(w.net_gain_30d), 0) AS best_one_way_net_30d
FROM ${gold}.move_whatif AS w
JOIN empty AS e ON e.zone_id = w.dest_zone
WHERE w.best_for_machine
GROUP BY w.current_zone, w.dest_zone, e.empty_slots_jun30
ORDER BY best_one_way_net_30d DESC;

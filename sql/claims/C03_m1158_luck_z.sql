-- C03: M-1158's shortfall vs theo is too large to be luck (a lead to inspect, not proof).
SELECT machine_id, config_id, days_on_floor,
       ROUND(house_win_usd, 0) AS house_win_usd, ROUND(theo_usd, 0) AS theo_usd,
       ROUND(observed_hold, 4) AS observed_hold, ROUND(theo_hold, 4) AS configured_hold,
       ROUND(luck_usd, 0) AS luck_usd, ROUND(luck_sd_usd, 0) AS luck_sd_usd, ROUND(luck_z, 2) AS luck_z,
       (SELECT COUNT(*) FROM ${gold}.machine_metrics_full WHERE luck_z <= -3) AS machines_with_z_at_or_below_minus3
FROM ${gold}.machine_metrics_full
WHERE machine_id = 'M-1158';

-- C01: The manager's bottom 10 (lowest total house win, Jan 1-Jun 30) and where they sit.
SELECT manager_rank, machine_id, zone_id, zone_name, bank_id, days_on_floor, retired,
       ROUND(house_win_usd, 0) AS house_win_usd
FROM ${gold}.machine_metrics_full
WHERE in_manager_bottom10
ORDER BY manager_rank;

-- C12: Play lost to downtime by month, valued hour by hour (D-027).
SELECT c.month,
       ROUND(SUM(d.down_hours), 0) AS down_machine_hours,
       ROUND(SUM(d.lost_coin_in_usd), 0) AS lost_coin_in_usd,
       ROUND(SUM(d.lost_theo_usd), 0) AS lost_theo_usd,
       ROUND(SUM(d.lost_theo_usd) / SUM(d.down_hours), 2) AS lost_theo_per_down_hour
FROM ${gold}.downtime_machine_day AS d
JOIN ${bronze}.calendar_day AS c ON c.gaming_date = d.gaming_date
GROUP BY c.month
ORDER BY c.month;

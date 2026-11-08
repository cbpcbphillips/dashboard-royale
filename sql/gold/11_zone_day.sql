-- Q2: zone x gaming day: machine demand plus door/zone counter traffic.
-- Traffic: only ok/partial counter hours count. A missing count is NOT zero, and entries are
-- crossings, not unique visitors. Gaming date of an hour = local hour start minus 6 h.
-- walkway_closed = the Main Entrance to Back Forty walkway was closed during that gaming day.
CREATE OR REPLACE TABLE ${gold}.zone_day AS
WITH m AS (
    SELECT zone_id, gaming_date, COUNT(*) AS machines_active,
           SUM(available_hours) AS available_hours, SUM(occupied_hours) AS occupied_hours,
           SUM(coin_in_usd) AS coin_in_usd, SUM(theo_usd) AS theo_usd, SUM(house_win_usd) AS house_win_usd
    FROM ${gold}.machine_day
    GROUP BY zone_id, gaming_date
), t AS (
    SELECT zone_id,
           CAST(hour_start_local - INTERVAL '6' HOUR AS DATE) AS gaming_date,
           SUM(CASE WHEN counter_status IN ('ok', 'partial') THEN entries_count END) AS entries_observed,
           SUM(CASE WHEN counter_status IN ('ok', 'partial') THEN coverage_minutes ELSE 0 END) / 60.0 AS covered_sensor_hours,
           COUNT(*) AS sensor_hours,
           SUM(CASE WHEN counter_status = 'offline' THEN 1 ELSE 0 END) AS offline_sensor_hours
    FROM ${bronze}.zone_traffic_hourly
    GROUP BY zone_id, CAST(hour_start_local - INTERVAL '6' HOUR AS DATE)
), w AS (
    SELECT c.gaming_date,
           MAX(CASE WHEN c.gaming_day_start_utc < w.closed_to_utc AND c.gaming_day_end_utc > w.closed_from_utc
                    THEN 1 ELSE 0 END) AS walkway_closed
    FROM ${bronze}.calendar_day AS c
    CROSS JOIN ${bronze}.floor_walkways AS w
    WHERE w.closed_from_utc IS NOT NULL
    GROUP BY c.gaming_date
)
SELECT m.*,
       t.entries_observed, t.covered_sensor_hours, t.sensor_hours, t.offline_sensor_hours,
       t.entries_observed / NULLIF(t.covered_sensor_hours, 0) AS entries_per_covered_hour,
       m.occupied_hours / m.available_hours AS occupancy,
       m.coin_in_usd / m.available_hours AS cpah,
       m.theo_usd / m.available_hours AS tpah,
       w.walkway_closed,
       c.is_weekend,
       c.month
FROM m
LEFT JOIN t ON t.zone_id = m.zone_id AND t.gaming_date = m.gaming_date
JOIN w ON w.gaming_date = m.gaming_date
JOIN ${bronze}.calendar_day AS c ON c.gaming_date = m.gaming_date;

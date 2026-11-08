-- Q3 (D-027): value each machine-hour of downtime at what its ZONE earns at that local hour on
-- that kind of day (weekday vs weekend), using the 1.3M-row hourly meters. Lost theo uses the
-- machine's own configured hold (same logic as D-025a). Only machine-days with downtime are kept.
CREATE OR REPLACE TABLE ${gold}.downtime_machine_day AS
WITH h AS (
    SELECT mh.machine_id, mh.gaming_date, mh.local_hour, md.zone_id, md.bank_id, md.manufacturer,
           md.configured_rtp, c.is_weekend,
           CAST(mh.available_seconds AS DOUBLE) / 3600 AS avail_hours,
           CAST(3600 - mh.available_seconds AS DOUBLE) / 3600 AS down_hours,
           CAST(mh.coin_in_cents AS DOUBLE) / 100 AS coin_in_usd
    FROM ${bronze}.machine_hour AS mh
    JOIN ${gold}.machine_day AS md ON md.machine_id = mh.machine_id AND md.gaming_date = mh.gaming_date
    JOIN ${bronze}.calendar_day AS c ON c.gaming_date = mh.gaming_date
    WHERE mh.active
), rate AS (
    SELECT zone_id, local_hour, is_weekend, SUM(coin_in_usd) / SUM(avail_hours) AS zone_cpah_at_hour
    FROM h
    GROUP BY zone_id, local_hour, is_weekend
)
SELECT h.machine_id, h.gaming_date, h.zone_id, h.bank_id, h.manufacturer,
       SUM(h.down_hours) AS down_hours,
       SUM(h.down_hours * r.zone_cpah_at_hour) AS lost_coin_in_usd,
       SUM(h.down_hours * r.zone_cpah_at_hour * (1 - h.configured_rtp)) AS lost_theo_usd
FROM h
JOIN rate AS r ON r.zone_id = h.zone_id AND r.local_hour = h.local_hour AND r.is_weekend = h.is_weekend
WHERE h.down_hours > 0
GROUP BY h.machine_id, h.gaming_date, h.zone_id, h.bank_id, h.manufacturer;

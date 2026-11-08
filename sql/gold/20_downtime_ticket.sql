-- Q3: one row per operations ticket with gaming date, shift, machine labels and timings (hours).
-- Shift of the opening time (local): day 06-14, swing 14-22, grave 22-06 (matches shift_roster).
CREATE OR REPLACE TABLE ${gold}.downtime_ticket AS
SELECT o.operation_id,
       o.machine_id,
       o.event_type,
       CAST(o.opened_at_local - INTERVAL '6' HOUR AS DATE) AS gaming_date,
       CASE WHEN hour(o.opened_at_local) >= 6 AND hour(o.opened_at_local) < 14 THEN 'day'
            WHEN hour(o.opened_at_local) >= 14 AND hour(o.opened_at_local) < 22 THEN 'swing'
            ELSE 'grave' END AS shift,
       hour(o.opened_at_local) AS opened_local_hour,
       mc.manufacturer,
       md.zone_id,
       md.bank_id,
       md.config_id,
       ${gold}.secs_between(o.opened_at_utc, o.work_started_at_utc) / 3600 AS wait_hours,
       ${gold}.secs_between(o.work_started_at_utc, o.available_at_utc) / 3600 AS repair_hours,
       ${gold}.secs_between(o.opened_at_utc, o.available_at_utc) / 3600 AS down_hours,
       ${gold}.secs_between(o.opened_at_utc, o.recorded_at_utc) / 3600 AS record_lag_hours,
       CAST(o.direct_cost_cents AS DOUBLE) / 100 AS direct_cost_usd
FROM ${bronze}.operations AS o
JOIN ${bronze}.machines AS mc ON mc.machine_id = o.machine_id
LEFT JOIN ${gold}.machine_day AS md
  ON md.machine_id = o.machine_id AND md.gaming_date = CAST(o.opened_at_local - INTERVAL '6' HOUR AS DATE);

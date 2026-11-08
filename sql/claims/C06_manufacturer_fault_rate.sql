-- C06: Fault tickets per 1,000 machine-days on the floor, by manufacturer (exposure-adjusted).
WITH f AS (
    SELECT manufacturer, COUNT(*) AS faults, SUM(down_hours) AS down_hours
    FROM ${gold}.downtime_ticket WHERE event_type = 'fault_repair' GROUP BY manufacturer
), d AS (
    SELECT manufacturer, COUNT(*) AS machine_days, COUNT(DISTINCT machine_id) AS machines
    FROM ${gold}.machine_day GROUP BY manufacturer
), v AS (
    SELECT manufacturer, SUM(lost_theo_usd) AS lost_theo_usd FROM ${gold}.downtime_machine_day GROUP BY manufacturer
)
SELECT d.manufacturer, d.machines, d.machine_days, f.faults,
       ROUND(f.faults * 1000.0 / d.machine_days, 1) AS faults_per_1000_machine_days,
       ROUND(f.down_hours, 0) AS fault_down_hours,
       ROUND(v.lost_theo_usd, 0) AS lost_theo_usd_all_downtime
FROM d JOIN f ON f.manufacturer = d.manufacturer JOIN v ON v.manufacturer = d.manufacturer
ORDER BY faults_per_1000_machine_days DESC;

-- Q3: slot-tech staffing per gaming day and shift next to the fault tickets opened in that shift.
CREATE OR REPLACE TABLE ${gold}.tech_shift_day AS
WITH s AS (
    SELECT gaming_date, shift, SUM(planned_headcount) AS planned_techs, SUM(actual_headcount) AS actual_techs
    FROM ${bronze}.shift_roster
    WHERE role = 'slot_tech'
    GROUP BY gaming_date, shift
), t AS (
    SELECT gaming_date, shift, COUNT(*) AS faults, AVG(wait_hours) AS avg_wait_hours,
           SUM(wait_hours) AS wait_hours, SUM(down_hours) AS down_hours
    FROM ${gold}.downtime_ticket
    WHERE event_type = 'fault_repair'
    GROUP BY gaming_date, shift
)
SELECT s.gaming_date, s.shift, s.planned_techs, s.actual_techs,
       CASE WHEN s.actual_techs < s.planned_techs THEN 1 ELSE 0 END AS short_staffed,
       COALESCE(t.faults, 0) AS faults, t.avg_wait_hours, COALESCE(t.wait_hours, 0) AS wait_hours,
       COALESCE(t.down_hours, 0) AS down_hours
FROM s
LEFT JOIN t ON t.gaming_date = s.gaming_date AND t.shift = s.shift;

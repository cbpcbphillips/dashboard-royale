-- Q2 (D-026): event lift = event-day coin-in divided by expected coin-in, where expected is the
-- average of NON-event days with the same weekday in the same month. The range uses the
-- day-to-day noise of non-event days around their own baseline (1.96 x SD / sqrt(event days)).
CREATE OR REPLACE TABLE ${gold}.event_uplift AS
WITH d AS (
    SELECT gaming_date, local_weekday, month, coin_in_usd, occupancy FROM ${gold}.floor_day
), ev AS (
    SELECT e.event_id, e.name, e.event_type, e.local_scope, e.start_date, e.end_date, e.announced_date, d.gaming_date
    FROM ${bronze}.events AS e
    JOIN d ON d.gaming_date BETWEEN e.start_date AND e.end_date
), base AS (
    SELECT month, local_weekday, AVG(coin_in_usd) AS base_coin_in, AVG(occupancy) AS base_occupancy, COUNT(*) AS base_days
    FROM d
    WHERE gaming_date NOT IN (SELECT gaming_date FROM ev)
    GROUP BY month, local_weekday
), noise AS (
    SELECT STDDEV_SAMP(d.coin_in_usd / b.base_coin_in) AS sd_ratio
    FROM d JOIN base AS b ON b.month = d.month AND b.local_weekday = d.local_weekday
    WHERE d.gaming_date NOT IN (SELECT gaming_date FROM ev)
)
SELECT ev.event_id, ev.name, ev.event_type, ev.local_scope, ev.start_date, ev.end_date, ev.announced_date,
       COUNT(*) AS event_days,
       SUM(d.coin_in_usd) AS event_coin_in_usd,
       SUM(b.base_coin_in) AS expected_coin_in_usd,
       SUM(d.coin_in_usd) / SUM(b.base_coin_in) AS uplift,
       SUM(d.coin_in_usd) / SUM(b.base_coin_in) - 1.96 * MAX(n.sd_ratio) / SQRT(COUNT(*)) AS uplift_lo,
       SUM(d.coin_in_usd) / SUM(b.base_coin_in) + 1.96 * MAX(n.sd_ratio) / SQRT(COUNT(*)) AS uplift_hi,
       SUM(d.coin_in_usd) - SUM(b.base_coin_in) AS extra_coin_in_usd,
       AVG(d.occupancy) / AVG(b.base_occupancy) AS occupancy_uplift,
       MIN(b.base_days) AS min_baseline_days
FROM ev
JOIN d ON d.gaming_date = ev.gaming_date
JOIN base AS b ON b.month = d.month AND b.local_weekday = d.local_weekday
CROSS JOIN noise AS n
GROUP BY ev.event_id, ev.name, ev.event_type, ev.local_scope, ev.start_date, ev.end_date, ev.announced_date;

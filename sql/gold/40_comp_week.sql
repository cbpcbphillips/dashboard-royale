-- Q5: loyalty ledger by gaming week (Monday start). Ledger timestamps are UTC, so each event is
-- mapped to its gaming date through calendar_day (06:00-06:00 local, DST-safe).
-- Comp economic cost equals the linked POS cogs, so it is counted once here. Face value is the
-- menu price, not revenue. Reinvestment = comp cost / carded theo of the same week.
CREATE OR REPLACE TABLE ${gold}.comp_week AS
WITH l AS (
    SELECT c.gaming_date, l.event_type, l.points_delta, l.face_value_cents, l.economic_cost_cents
    FROM ${bronze}.loyalty_ledger AS l
    JOIN ${bronze}.calendar_day AS c
      ON l.event_at_utc >= c.gaming_day_start_utc AND l.event_at_utc < c.gaming_day_end_utc
), lw AS (
    SELECT CAST(date_trunc('week', gaming_date) AS DATE) AS week_start,
           COUNT(DISTINCT gaming_date) AS days,
           SUM(CASE WHEN event_type = 'redeem' THEN 1 ELSE 0 END) AS redemptions,
           SUM(CASE WHEN event_type = 'redeem' THEN -points_delta ELSE 0 END) AS points_redeemed,
           SUM(CASE WHEN event_type = 'award' THEN points_delta ELSE 0 END) AS points_awarded,
           SUM(CASE WHEN event_type = 'redeem' THEN face_value_cents ELSE 0 END) / 100.0 AS comp_face_usd,
           SUM(CASE WHEN event_type = 'redeem' THEN economic_cost_cents ELSE 0 END) / 100.0 AS comp_cost_usd
    FROM l
    GROUP BY CAST(date_trunc('week', gaming_date) AS DATE)
), tw AS (
    SELECT CAST(date_trunc('week', gaming_date) AS DATE) AS week_start,
           SUM(carded_theo_usd) AS carded_theo_usd, SUM(carded_coin_in_usd) AS carded_coin_in_usd
    FROM ${silver}.machine_day_active
    GROUP BY CAST(date_trunc('week', gaming_date) AS DATE)
)
SELECT lw.*,
       tw.carded_theo_usd,
       tw.carded_coin_in_usd,
       lw.points_redeemed / NULLIF(lw.comp_face_usd, 0) AS points_per_comp_face_usd,
       lw.points_awarded / NULLIF(tw.carded_theo_usd, 0) AS points_awarded_per_theo_usd,
       lw.comp_cost_usd / NULLIF(tw.carded_theo_usd, 0) AS comp_reinvestment,
       lw.comp_cost_usd / NULLIF(lw.comp_face_usd, 0) AS cost_to_face_ratio
FROM lw
JOIN tw ON tw.week_start = lw.week_start;

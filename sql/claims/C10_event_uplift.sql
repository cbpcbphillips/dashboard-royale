-- C10: Coin-in lift on event days vs the same weekday in the same month (D-026).
SELECT name, event_type, local_scope, start_date, end_date, event_days,
       ROUND(uplift, 3) AS uplift, ROUND(uplift_lo, 3) AS uplift_lo, ROUND(uplift_hi, 3) AS uplift_hi,
       ROUND(extra_coin_in_usd, 0) AS extra_coin_in_usd, ROUND(occupancy_uplift, 3) AS occupancy_uplift,
       announced_date
FROM ${gold}.event_uplift
ORDER BY start_date;

-- Q2: one row per gaming day for the whole floor (machine meters = all play, carded or not).
CREATE OR REPLACE TABLE ${gold}.floor_day AS
WITH m AS (
    SELECT gaming_date,
           COUNT(*) AS machines_active,
           SUM(available_hours) AS available_hours,
           SUM(occupied_hours) AS occupied_hours,
           SUM(coin_in_usd) AS coin_in_usd,
           SUM(house_win_usd) AS house_win_usd,
           SUM(theo_usd) AS theo_usd,
           SUM(luck_var_cents2) AS luck_var_cents2,
           SUM(paid_spins) AS paid_spins,
           SUM(carded_coin_in_usd) AS carded_coin_in_usd
    FROM ${gold}.machine_day
    GROUP BY gaming_date
)
SELECT m.*,
       c.local_weekday, c.is_weekend, c.month, c.federal_holiday, p.events_active,
       m.occupied_hours / m.available_hours AS occupancy,
       m.coin_in_usd / m.available_hours AS cpah,
       m.coin_in_usd / NULLIF(m.paid_spins, 0) AS avg_bet_usd,
       m.carded_coin_in_usd / m.coin_in_usd AS carded_share,
       m.house_win_usd / m.coin_in_usd AS observed_hold,
       m.theo_usd / m.coin_in_usd AS theo_hold,
       CAST(p.pos_cash_usd AS DOUBLE) AS pos_cash_usd,
       CAST(p.comp_cost_usd AS DOUBLE) AS comp_cost_usd,
       p.faults_opened,
       p.incidents_reported,
       p.total_zone_entries_observed,
       p.counter_coverage_share,
       CAST(p.contribution_after_supplied_costs_usd AS DOUBLE) AS contribution_usd
FROM m
JOIN ${bronze}.calendar_day AS c ON c.gaming_date = m.gaming_date
JOIN ${bronze}.property_day AS p ON p.gaming_date = m.gaming_date;

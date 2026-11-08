-- C08: Month-to-month swings in floor hold are luck: observed hold vs configured (theo) hold,
-- with the luck z-score of each month's house win.
SELECT month,
       ROUND(SUM(house_win_usd) / SUM(coin_in_usd), 4) AS observed_hold,
       ROUND(SUM(theo_usd) / SUM(coin_in_usd), 4) AS theo_hold,
       ROUND(SUM(house_win_usd) - SUM(theo_usd), 0) AS luck_usd,
       ROUND((SUM(house_win_usd) - SUM(theo_usd)) / (SQRT(SUM(luck_var_cents2)) / 100), 2) AS luck_z
FROM ${gold}.floor_day
GROUP BY month
ORDER BY month;

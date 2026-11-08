-- Q5: comps by loyalty tier x month, from player_period (tracked play). Inputs to the tier-mix
-- check in D-029: if reinvestment rose only because the tier mix shifted, the within-tier
-- rates would stay flat.
CREATE OR REPLACE TABLE ${gold}.comp_tier_month AS
SELECT opening_tier,
       period_month,
       COUNT(DISTINCT CASE WHEN coin_in_usd > 0 THEN player_id END) AS players_with_play,
       SUM(observed_visits) AS visits,
       SUM(theo_usd) AS theo_usd,
       SUM(coin_in_usd) AS coin_in_usd,
       SUM(comps_redeemed) AS comps_redeemed,
       SUM(comp_cost_usd) AS comp_cost_usd,
       SUM(comp_face_usd) AS comp_face_usd,
       SUM(points_earned) AS points_earned,
       SUM(points_redeemed) AS points_redeemed,
       SUM(comp_cost_usd) / NULLIF(SUM(theo_usd), 0) AS comp_reinvestment,
       SUM(points_redeemed) / NULLIF(SUM(comp_face_usd), 0) AS points_per_comp_face_usd
FROM ${gold}.player_month
GROUP BY opening_tier, period_month;

-- Q4: full-window summary for each drill group (long format: dimension, group). Players are
-- aggregated over the whole window first; "ahead" = summed net > 0 among players with play.
CREATE OR REPLACE TABLE ${gold}.player_group_summary AS
WITH p AS (
    SELECT player_id, opening_tier, age_band, home_region, spend_segment,
           SUM(coin_in_usd) AS coin_in, SUM(net_usd) AS net, SUM(theo_usd) AS theo, SUM(luck_usd) AS luck,
           SUM(comp_cost_usd) AS comp_cost, SUM(observed_visits) AS visits, SUM(contribution_usd) AS contribution
    FROM ${gold}.player_month
    GROUP BY player_id, opening_tier, age_band, home_region, spend_segment
), g AS (
    SELECT 'All players' AS dimension, 'All' AS grp, p.* FROM p
    UNION ALL SELECT 'Loyalty tier', opening_tier, p.* FROM p
    UNION ALL SELECT 'Age band', age_band, p.* FROM p
    UNION ALL SELECT 'Home region', home_region, p.* FROM p
    UNION ALL SELECT 'Spend segment', spend_segment, p.* FROM p
), tot AS (SELECT SUM(theo) AS theo_all, SUM(-net) AS loss_all FROM p)
SELECT g.dimension, g.grp,
       COUNT(*) AS players,
       SUM(CASE WHEN g.coin_in > 0 THEN 1 ELSE 0 END) AS players_with_play,
       SUM(CASE WHEN g.coin_in > 0 AND g.net > 0 THEN 1 ELSE 0 END)
           / NULLIF(SUM(CASE WHEN g.coin_in > 0 THEN 1.0 ELSE 0 END), 0) AS ahead_rate,
       SUM(g.coin_in) AS coin_in_usd,
       SUM(g.net) AS net_usd,
       SUM(g.theo) AS theo_usd,
       SUM(g.luck) AS luck_usd,
       SUM(g.comp_cost) AS comp_cost_usd,
       SUM(g.comp_cost) / NULLIF(SUM(g.theo), 0) AS comp_reinvestment,
       SUM(g.theo) / MAX(t.theo_all) AS share_of_theo,
       SUM(-g.net) / MAX(t.loss_all) AS share_of_net_loss,
       SUM(g.visits) / NULLIF(SUM(CASE WHEN g.coin_in > 0 THEN 1.0 ELSE 0 END), 0) AS visits_per_player_with_play,
       SUM(g.contribution) AS contribution_usd
FROM g
CROSS JOIN tot AS t
GROUP BY g.dimension, g.grp;

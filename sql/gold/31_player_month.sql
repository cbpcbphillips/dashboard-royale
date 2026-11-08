-- Q4/Q5: player x month with drill groups, in dollars (DOUBLE). The app aggregates to player over
-- the selected months FIRST, then computes ahead rate / concentration (never per-month ratios).
CREATE OR REPLACE TABLE ${gold}.player_month AS
SELECT pp.player_id,
       pp.period_month,
       d.opening_tier, d.age_band, d.home_region, d.spend_segment,
       pp.tier_end,
       pp.observed_visits,
       pp.sessions AS session_count,
       pp.carded_play_hours,
       CAST(pp.tracked_coin_in_usd AS DOUBLE) AS coin_in_usd,
       CAST(pp.tracked_payout_usd AS DOUBLE) AS payout_usd,
       CAST(pp.tracked_net_usd AS DOUBLE) AS net_usd,
       CAST(pp.theo_usd AS DOUBLE) AS theo_usd,
       CAST(pp.luck_residual_usd AS DOUBLE) AS luck_usd,
       CAST(pp.linked_pos_cash_usd AS DOUBLE) AS pos_cash_usd,
       CAST(pp.linked_pos_cogs_usd AS DOUBLE) AS pos_cogs_usd,
       pp.comps_redeemed,
       CAST(pp.comp_face_value_usd AS DOUBLE) AS comp_face_usd,
       CAST(pp.comp_cost_usd AS DOUBLE) AS comp_cost_usd,
       pp.points_earned,
       pp.points_redeemed,
       CAST(pp.tracked_contribution_usd AS DOUBLE) AS contribution_usd
FROM ${bronze}.player_period AS pp
JOIN ${gold}.player_dim AS d ON d.player_id = pp.player_id;

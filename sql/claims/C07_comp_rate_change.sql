-- C07: Comps got about 2x cheaper in points from the week of Apr 28; comp cost per $ theo rose
-- ~12% and the rise survives holding the tier mix fixed; visits per player barely moved.
SELECT week_start, redemptions, ROUND(points_per_comp_face_usd, 2) AS points_per_comp_usd,
       ROUND(comp_cost_usd, 0) AS comp_cost_usd, ROUND(comp_reinvestment, 4) AS comp_cost_per_carded_theo
FROM ${gold}.comp_week
WHERE days = 7
ORDER BY week_start;
SELECT opening_tier, change_week_start,
       ROUND(weekly_points_per_comp_usd_before, 2) AS pts_per_comp_usd_before,
       ROUND(weekly_points_per_comp_usd_after, 2) AS pts_per_comp_usd_after,
       ROUND(reinvestment_before, 4) AS reinvestment_before, ROUND(reinvestment_after, 4) AS reinvestment_after,
       ROUND(visits_per_player_month_before, 2) AS visits_pp_month_before,
       ROUND(visits_per_player_month_after, 2) AS visits_pp_month_after,
       ROUND(comps_per_player_month_before, 3) AS comps_pp_month_before,
       ROUND(comps_per_player_month_after, 3) AS comps_pp_month_after,
       before_months, after_months
FROM ${gold}.comp_change
ORDER BY opening_tier;

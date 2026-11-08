-- C22: All allowed mixes (<= 3 action types, within the 100k budget, comp pilot and comp change not together),
-- ranked by best-estimate net gain; the chosen mix (2 promotion weekends + inspect M-1158) and the safest mix (best worst case).
SELECT rank_mid, rank_low, actions, types, ROUND(cost, 0) AS cost_usd,
       ROUND(net_low, 0) AS net_low, ROUND(net_mid, 0) AS net_mid, ROUND(net_high, 0) AS net_high,
       (SELECT COUNT(*) FROM ${gold}.budget_portfolios) AS allowed_mixes
FROM ${gold}.budget_portfolios
WHERE rank_mid <= 3 OR rank_low <= 3 OR actions IN ('A-INSPECT + A-PROMO x2', 'A-INSPECT + A-PROMO x2 + A-WAYFINDING')
ORDER BY rank_mid;

-- C09: Replacing a machine does not pay back inside the 30-day budget window (July 1-30).
-- Demand-based gain (D-025): coin-in shortfall vs bank-mates x the machine's own hold,
-- for the days left after the lease lead time, minus install downtime and lease cost.
SELECT verdict,
       COUNT(*) AS machines,
       SUM(CASE WHEN replacement_net_30d_lease > 0 THEN 1 ELSE 0 END) AS lease_positive,
       SUM(CASE WHEN replacement_net_30d_lease_lo > 0 THEN 1 ELSE 0 END) AS lease_positive_at_low_end,
       SUM(CASE WHEN replacement_net_30d_buy > 0 THEN 1 ELSE 0 END) AS buy_positive,
       ROUND(MAX(replacement_net_30d_lease), 0) AS best_lease_net_usd
FROM ${gold}.machine_verdict
WHERE verdict <> 'Already retired'
GROUP BY verdict
ORDER BY verdict;

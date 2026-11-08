-- C21: Every catalog action costed for July 1-30 (catalog formula + machine downtime) and valued as
-- expected earnings over only the days left after its lead time (royale/budget.py). Net = gain - cost.
SELECT action, qty, target, ROUND(cost, 0) AS cost_usd, benefit_days,
       ROUND(benefit_low, 0) AS gain_low, ROUND(benefit_mid, 0) AS gain_mid, ROUND(benefit_high, 0) AS gain_high,
       ROUND(net_low, 0) AS net_low, ROUND(net_mid, 0) AS net_mid, ROUND(net_high, 0) AS net_high, evidence
FROM ${gold}.budget_actions
ORDER BY net_mid DESC;

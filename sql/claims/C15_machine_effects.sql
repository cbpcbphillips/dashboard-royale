-- C15: Once spot (bank, zone) and game are known, machines barely differ: credibility-shrunk
-- machine effects (July refit on Jan-Jun) and how they line up with the Q1 verdict.
SELECT v.verdict,
       COUNT(*) AS machines,
       ROUND(MIN(e.effect), 3) AS min_effect,
       ROUND(MAX(e.effect), 3) AS max_effect,
       SUM(CASE WHEN e.effect_hi < 1 THEN 1 ELSE 0 END) AS clearly_below_expected,
       SUM(CASE WHEN e.effect_lo > 1 THEN 1 ELSE 0 END) AS clearly_above_expected
FROM ${gold}.machine_effect AS e
JOIN ${gold}.machine_verdict AS v ON v.machine_id = e.machine_id
WHERE e.fit = 'july_refit_jan_jun_tpah'
GROUP BY v.verdict
ORDER BY v.verdict;
SELECT v.machine_id, v.verdict, ROUND(e.raw_ratio, 3) AS raw_ratio, ROUND(e.effect, 3) AS effect,
       ROUND(e.effect_lo, 3) AS effect_lo, ROUND(e.effect_hi, 3) AS effect_hi, ROUND(e.credibility, 2) AS credibility
FROM ${gold}.machine_effect AS e
JOIN ${gold}.machine_verdict AS v ON v.machine_id = e.machine_id
WHERE e.fit = 'july_refit_jan_jun_tpah' AND v.verdict IN ('Machine/game', 'Inspect (leak?)')
ORDER BY e.effect;

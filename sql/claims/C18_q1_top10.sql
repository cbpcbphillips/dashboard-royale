-- C18: The Q1 top 10 for Jan 1 - Jun 30, recomputed in plain SQL from the gold tables
-- (same steps as royale/q1_reference.py and web/lib/q1.ts; docs/Q1.md):
--   1. same days: scale each machine's daily prediction by how the REST of the floor did that day
--   2. weekly ratio estimator: R = actual / predicted, SE from week-to-week spread
--   3. shrink: weight = tau2 / (tau2 + SE^2); play dollars short = weight x (predicted - actual)
--      tau2 = 0.0010751 = how much machines really differ (printed by royale.q1_reference)
--   4. luck: house win - theo; z = luck / luck SD. Beyond chance if z < -3.60, the 5% cutoff for the
--      most extreme of 310 machines (first step of Holm); then the whole luck shortfall counts.
--   score = play dollars short + proven luck shortfall
WITH d AS (
  SELECT m.machine_id, m.gaming_date, m.theo_usd AS a, e.expected_theo_usd AS e0,
         m.house_win_usd AS hw, m.luck_var_cents2 AS lv
  FROM ${gold}.machine_day m
  JOIN ${gold}.q1_expected_day e ON e.machine_id = m.machine_id AND e.gaming_date = m.gaming_date
),
dy AS (SELECT gaming_date, SUM(a) AS da, SUM(e0) AS de FROM d GROUP BY gaming_date),
c AS (SELECT d.*, d.e0 * (dy.da - d.a) / (dy.de - d.e0) AS e FROM d JOIN dy ON dy.gaming_date = d.gaming_date),
wk AS (SELECT machine_id, DATE_TRUNC('week', gaming_date) AS w, SUM(a) AS a, SUM(e) AS e FROM c GROUP BY machine_id, DATE_TRUNC('week', gaming_date)),
mt AS (SELECT machine_id, SUM(a) / SUM(e) AS r, COUNT(*) AS n_weeks, AVG(e) AS mean_e FROM wk GROUP BY machine_id),
se AS (
  SELECT wk.machine_id, SQRT(SUM(POWER(wk.a - mt.r * wk.e, 2)) / (MAX(mt.n_weeks) * (MAX(mt.n_weeks) - 1))) / MAX(mt.mean_e) AS se
  FROM wk JOIN mt ON mt.machine_id = wk.machine_id GROUP BY wk.machine_id
),
tot AS (
  SELECT machine_id, COUNT(*) AS days, SUM(a) AS actual, SUM(e) AS predicted, SUM(hw) - SUM(a) AS luck,
         SQRT(SUM(lv)) / 100 AS luck_sd
  FROM c GROUP BY machine_id
),
s AS (
  SELECT tot.*, mt.r, se.se, 0.0010751 / (0.0010751 + se.se * se.se) AS weight,
         (tot.luck / tot.luck_sd) AS luck_z
  FROM tot JOIN mt ON mt.machine_id = tot.machine_id JOIN se ON se.machine_id = tot.machine_id
)
SELECT RANK() OVER (ORDER BY weight * (predicted - actual) + CASE WHEN luck_z < -3.60 THEN GREATEST(-luck, 0) ELSE 0 END DESC) AS q1_rank,
       machine_id, days,
       ROUND(predicted, 0) AS predicted_theo_usd, ROUND(actual, 0) AS actual_theo_usd,
       ROUND(1 - r, 4) AS raw_gap, ROUND(weight, 3) AS weight, ROUND(weight * (1 - r), 4) AS shrunk_gap,
       ROUND(weight * (predicted - actual), 0) AS play_short_usd,
       ROUND(luck_z, 2) AS luck_z,
       ROUND(weight * (predicted - actual) + CASE WHEN luck_z < -3.60 THEN GREATEST(-luck, 0) ELSE 0 END, 0) AS short_of_prediction_usd
FROM s
ORDER BY q1_rank
LIMIT 10;

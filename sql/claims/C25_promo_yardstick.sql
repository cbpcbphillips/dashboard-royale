-- C25: the forecast as the July promotion's yardstick. Whole-floor daily forecast error in the frozen test
-- (May-Jun), bias removed; smallest lift detectable over 6 promotion days = 1.96 x sd / sqrt(6).
WITH d AS (
  SELECT gaming_date, SUM(actual * available_hours) / SUM(pred_model * available_hours) - 1 AS err
  FROM ${gold}.model_predictions WHERE target = 'tpah' GROUP BY gaming_date
)
SELECT COUNT(*) AS test_days, ROUND(AVG(err), 4) AS bias, ROUND(STDDEV_SAMP(err), 4) AS daily_error_sd,
       ROUND(1.96 * STDDEV_SAMP(err) / SQRT(6), 4) AS detectable_lift_6_days
FROM d;

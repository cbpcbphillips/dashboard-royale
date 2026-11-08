-- C14: Frozen forecast (fit Jan-Apr, predict May-Jun) vs both baselines. Errors in $ per
-- available hour; "diff" < 0 means the model beats that baseline; lo/hi = 95% bootstrap over machines.
SELECT target, label,
       ROUND(mae_machine_period, 3) AS mae_2month_per_machine,
       ROUND(bias_machine_period, 3) AS bias_2month,
       ROUND(mae_machine_day, 3) AS mae_per_machine_day,
       ROUND(mae_moved_or_new, 3) AS mae_moved_or_new_3_machines,
       ROUND(mae_diff_vs_pred_persistence, 3) AS diff_vs_persistence,
       ROUND(mae_diff_vs_pred_persistence_lo, 3) AS lo_p, ROUND(mae_diff_vs_pred_persistence_hi, 3) AS hi_p,
       ROUND(mae_diff_vs_pred_zone_game, 3) AS diff_vs_zone_game,
       ROUND(mae_diff_vs_pred_zone_game_lo, 3) AS lo_z, ROUND(mae_diff_vs_pred_zone_game_hi, 3) AS hi_z,
       leakage_test_max_abs_change,
       mlflow_run_id
FROM ${gold}.model_metrics
ORDER BY target, mae_machine_period;

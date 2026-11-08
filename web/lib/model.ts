import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Model validation (claims C14, C16): frozen forecast fit on Jan-Apr, predicting May-Jun, vs two simple
// baselines. Data: web/data/model.json (royale/export_app.py --only model, from the Databricks gold tables).

export type Metric = {
  method: string; label: string; mae_machine_period: number; bias_machine_period: number; mae_machine_day: number;
  mae_moved_or_new: number; mean_actual_rate: number; machines: number; machine_days: number;
  mae_diff_vs_pred_persistence: number; mae_diff_vs_pred_persistence_lo: number; mae_diff_vs_pred_persistence_hi: number;
  mae_diff_vs_pred_zone_game: number; mae_diff_vs_pred_zone_game_lo: number; mae_diff_vs_pred_zone_game_hi: number;
  mlflow_run_id: string; leakage_test_max_abs_change: number;
};
type ModelData = {
  meta: { generated_at: string; source: string };
  metrics: Metric[];
  daily: { d: string; actual: number; model: number; zone_game: number; persistence: number; weekday: number }[];
  weekday: {
    mae_machine_day_weekday: number; mae_machine_period_weekday: number; mae_machine_day_model: number; mae_machine_period_model: number;
    day_diff_model_minus_weekday: number; day_diff_lo: number; day_diff_hi: number;
    period_diff_model_minus_weekday: number; period_diff_lo: number; period_diff_hi: number; mlflow_run_id: string | null; weekday_factors: string;
  };
  moves: { machine_id: string; move_date: string; from_zone: string; to_zone: string; actual_before: number; actual_after: number; actual_change: number; predicted_change: number }[];
};

export const MODEL: ModelData = JSON.parse(readFileSync(path.join(process.cwd(), "data", "model.json"), "utf8"));

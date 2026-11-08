import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Q6: the $100k plan for July 1-30 as a cost analysis. Data: web/data/q6.json written by royale/budget.py
// (also royale.gold.budget_actions / budget_portfolios on Databricks). Plan: docs/plans/B6_budget.md.

export type Action = {
  action: string; name: string; qty: number; target: string; cost: number;
  benefit_low: number; benefit_mid: number; benefit_high: number; benefit_days: number;
  net_low: number; net_mid: number; net_high: number; return_per_dollar_mid: number; how: string; evidence: string;
};
export type Portfolio = { actions: string; types: number; cost: number; net_low: number; net_mid: number; net_high: number; rank_mid: number; rank_low: number };
type Q6Data = {
  meta: { generated_at: string; source: string; budget: number; window: string; chosen: string };
  actions: Action[]; portfolios: Portfolio[]; chosen: Portfolio[]; n_portfolios: number;
};

export const Q6: Q6Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q6.json"), "utf8"));

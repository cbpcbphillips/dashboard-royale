import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { monthRange } from "./q4";

// Q5: what do comps cost, and what changed? Data: web/data/q5.json (royale/export_app.py, from the
// Databricks gold tables comp_week, comp_tier_month, comp_change; claim C07). Comp cost = the casino's
// economic cost (already inside cost of goods); face value is what the guest sees, never revenue.

type Week = { week_start: string; days: number; redemptions: number; points_redeemed: number; comp_face_usd: number; comp_cost_usd: number; carded_theo_usd: number; points_per_comp_face_usd: number; comp_reinvestment: number };
type TierMonth = { opening_tier: string; month: string; players_with_play: number; visits: number; theo_usd: number; comps_redeemed: number; comp_cost_usd: number; comp_face_usd: number; points_redeemed: number };
export type Change = {
  opening_tier: string; reinvestment_before: number; reinvestment_after: number;
  visits_per_player_month_before: number | null; visits_per_player_month_after: number | null;
  comps_per_player_month_before: number | null; comps_per_player_month_after: number | null;
  weekly_points_per_comp_usd_before: number; weekly_points_per_comp_usd_after: number; change_week_start: string;
};
type Q5Data = { meta: { generated_at: string; source: string }; weeks: Week[]; tier_month: TierMonth[]; change: Change[] };

const data: Q5Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q5.json"), "utf8"));
export const Q5_META = data.meta;
export const Q5_TIERS = [...new Set(data.tier_month.map((t) => t.opening_tier))].sort((a, b) => ["Base", "Gold", "Platinum"].indexOf(a) - ["Base", "Gold", "Platinum"].indexOf(b));
export const Q5_CHANGE = data.change;
export const CHANGE_WEEK = data.change[0]?.change_week_start ?? "2025-04-28";

/** The +x% rise in comp cost per $ of expected earnings (January–March weeks vs June weeks, as in the tier table), with a 95% range
 *  from 2,000 resamples of weeks (fixed seed, so the page is stable). */
export function compRiseRange() {
  const full = data.weeks.filter((w) => w.days === 7);
  // same months as the before/after table: January–March vs June
  const before = full.filter((w) => w.week_start < "2025-04-01"), after = full.filter((w) => w.week_start >= "2025-06-01");
  const ratio = (xs: Week[]) => xs.reduce((a, w) => a + w.comp_cost_usd, 0) / xs.reduce((a, w) => a + w.carded_theo_usd, 0);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs: Week[]) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
  const draws = Array.from({ length: 2000 }, () => ratio(pick(after)) / ratio(pick(before)) - 1).sort((a, b) => a - b);
  return { rise: ratio(after) / ratio(before) - 1, lo: draws[50], hi: draws[1949] };
}

export function computeQ5(from: string, to: string, tier?: string) {
  const months = monthRange(from, to);
  const tm = data.tier_month.filter((t) => t.month >= months.from && t.month <= months.to && (!tier || t.opening_tier === tier));
  const sum = (k: keyof TierMonth) => tm.reduce((a, t) => a + (t[k] as number), 0);
  const cost = sum("comp_cost_usd"), face = sum("comp_face_usd"), theo = sum("theo_usd"), pts = sum("points_redeemed"), comps = sum("comps_redeemed");
  const playerMonths = sum("players_with_play");
  // weeks that overlap the chosen dates (floor-wide; full 7-day weeks only, so rates compare)
  const weeks = data.weeks.filter((w) => w.days === 7);
  const byMonth = [...new Set(data.tier_month.map((t) => t.month))].sort().map((m) => {
    const x = data.tier_month.filter((t) => t.month === m && (!tier || t.opening_tier === tier));
    const c = x.reduce((a, t) => a + t.comp_cost_usd, 0), th = x.reduce((a, t) => a + t.theo_usd, 0);
    return { month: m, reinvestment: c / th, inPeriod: m >= months.from && m <= months.to };
  });
  return {
    months, tier: tier ?? "All tiers", cost, face, theo, comps,
    reinvestment: theo ? cost / theo : NaN,
    pointsPerComp: face ? pts / face : NaN,
    compsPerPlayerMonth: playerMonths ? comps / playerMonths : NaN,
    weeks: weeks.map((w) => ({ week: w.week_start, points: w.points_per_comp_face_usd, reinvestment: w.comp_reinvestment, inPeriod: w.week_start >= from.slice(0, 10) && w.week_start <= to })),
    byMonth,
  };
}

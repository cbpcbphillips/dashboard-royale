import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Q4: what did tracked (carded) players wager, get back and net, and how concentrated is it?
// Data: web/data/q4.json (royale/export_app.py). player_period is monthly, so periods snap to whole
// months; players are summed over the months first, then shares are computed (claim C13).

export type Q4Row = {
  from: string; to: string; dim: string; grp: string; players: number; ahead: number;
  coin: number; payout: number; net: number; theo: number; luck: number; comp: number; visits: number;
  share_theo: number; share_loss: number; top10_theo: number; top10_loss: number | null; top1_theo: number; top1_ahead: number;
  median_net: number; lorenz: number[];
};
type Q4Data = { meta: { generated_at: string; source: string }; months: string[]; dims: Record<string, string[]>; rows: Q4Row[] };

const data: Q4Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q4.json"), "utf8"));
export const Q4_META = data.meta;
export const Q4_DIMS = data.dims;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Snap a date range to the whole months it touches. */
export function monthRange(from: string, to: string) {
  const m0 = from.slice(0, 7), m1 = to.slice(0, 7);
  const name = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1];
  return { from: m0, to: m1, label: m0 === m1 ? `${name(m0)} 2025` : `${name(m0)} – ${name(m1)} 2025` };
}

export function parseGroup(raw: string | string[] | undefined): { dim: string; grp: string } {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v) {
    const [dim, grp] = v.split(":");
    if (data.dims[dim]?.includes(grp)) return { dim, grp };
  }
  return { dim: "All players", grp: "All" };
}

export function computeQ4(from: string, to: string, dim: string, grp: string) {
  const r = monthRange(from, to);
  const rows = data.rows.filter((x) => x.from === r.from && x.to === r.to);
  const all = rows.find((x) => x.dim === "All players")!;
  const sel = rows.find((x) => x.dim === dim && x.grp === grp) ?? all;
  const groups = Object.keys(data.dims).map((d) => ({ dim: d, rows: rows.filter((x) => x.dim === d) }));
  return { months: r, all, sel, groups };
}

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function q4Sentence(q: ReturnType<typeof computeQ4>): string {
  const s = q.sel;
  const who = s.dim === "All players" ? "tracked players" : `tracked players in ${s.dim.toLowerCase()} “${s.grp}”`;
  const parts = [`Of ${s.players.toLocaleString("en-US")} ${who} in ${q.months.label}, ${pct(s.ahead)} finished ahead; the typical player ${s.median_net < 0 ? "lost" : "won"} ${usd(s.median_net)}`];
  parts.push(`the top 10% by play account for ${pct(s.top10_theo)} of their expected earnings`);
  if (s.dim !== "All players") parts.push(`this group is ${pct(s.players / q.all.players)} of players but ${pct(s.share_theo)} of all tracked expected earnings`);
  return parts.join("; ") + ".";
}

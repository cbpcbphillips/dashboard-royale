import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Q2: what changed in demand? Data: web/data/q2.json (royale/export_app.py, from the Databricks gold
// tables zone_day, event_uplift, walkway_periods). Machine meters count all play (carded or not);
// door/zone counters count crossings, not people, and offline hours are left out, not zero.

type Q2Data = {
  meta: { generated_at: string; source: string };
  dates: string[];
  zones: { zone_id: string; name: string }[];
  rows: { z: string[]; d: number[]; coin: number[]; theo: number[]; ah: number[]; oh: number[]; ent: (number | null)[]; cov: (number | null)[]; wc: number[] };
  events: { name: string; event_type: string; local_scope: string; start_date: string; end_date: string; event_days: number; uplift: number; uplift_lo: number; uplift_hi: number; extra_coin_in_usd: number }[];
  walkway: { area: string; period: string; days: number; occupancy: number; cpah: number; entries_per_covered_hour: string | number }[];
  hourweek: { z: string; wd: string; hr: number; coin: number; ah: number; oh: number }[];
  dip: { test: string; change: number | null; lo: number | null; hi: number | null; share: number | null; verdict: string; note: string }[];
};

const data: Q2Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q2.json"), "utf8"));
export const Q2_META = data.meta;
export const Q2_ZONES = data.zones;
/** Why the floor got quieter after April (claim C23, royale/q2_dip.py): whole half-year, not affected by filters. */
export const Q2_DIP = data.dip;
/** Machines in use by weekday x hour (gaming day), whole half-year, for one zone or the floor. */
export function hourWeek(zone?: string) {
  const m = new Map<string, { ah: number; oh: number }>();
  for (const r of data.hourweek) {
    if (zone && r.z !== zone) continue;
    const k = `${r.wd}|${r.hr}`;
    const x = m.get(k) ?? { ah: 0, oh: 0 };
    x.ah += r.ah; x.oh += r.oh; m.set(k, x);
  }
  return [...m.entries()].map(([k, x]) => { const [wd, hr] = k.split("|"); return { wd, hr: Number(hr), v: x.oh / x.ah }; });
}
const R = data.rows;
const DATES = data.dates;
const WEEKDAY = DATES.map((d) => new Date(d + "T00:00:00Z").getUTCDay()); // 0 = Sunday
const zoneName = (id: string) => data.zones.find((z) => z.zone_id === id)?.name ?? id;

export type DayPoint = { date: string; coin: number; avg7: number | null; occupancy: number; closed: boolean };
export type ZoneRow = { id: string; name: string; coinPerHour: number; occupancy: number; traffic: number | null; coinPerDay: number };
export type Q2Result = {
  scopeName: string;
  days: DayPoint[];
  coinPerDay: number;
  vsHalfYear: number; // period coin/day vs the whole Jan–Jun average, same scope
  weekendLift: number; // weekend coin/day ÷ weekday coin/day − 1
  occupancy: number;
  months: { month: string; coinPerDay: number }[];
  zones: ZoneRow[];
  events: (Q2Data["events"][number] & { inPeriod: boolean })[];
  walkway: { area: string; period: string; days: number; occupancy: number; cpah: number; traffic: number }[];
  closure: { from: string; to: string } | null;
};

function sums(from: string, to: string, zone?: string) {
  const byDay = new Map<number, { coin: number; ah: number; oh: number; wc: number }>();
  for (let i = 0; i < R.d.length; i++) {
    const date = DATES[R.d[i]];
    if (date < from || date > to || (zone && R.z[i] !== zone)) continue;
    const s = byDay.get(R.d[i]) ?? { coin: 0, ah: 0, oh: 0, wc: 0 };
    s.coin += R.coin[i]; s.ah += R.ah[i]; s.oh += R.oh[i]; s.wc = Math.max(s.wc, R.wc[i]);
    byDay.set(R.d[i], s);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function computeQ2(from: string, to: string, zone?: string): Q2Result {
  const days = sums(from, to, zone);
  const all = sums(DATES[0], DATES[DATES.length - 1], zone);
  const total = (xs: typeof days) => xs.reduce((a, [, s]) => ({ coin: a.coin + s.coin, ah: a.ah + s.ah, oh: a.oh + s.oh }), { coin: 0, ah: 0, oh: 0 });
  const t = total(days);
  const coinPerDay = days.length ? t.coin / days.length : 0;
  const halfYear = all.length ? total(all).coin / all.length : 0;
  const we = days.filter(([d]) => WEEKDAY[d] === 0 || WEEKDAY[d] === 6), wd = days.filter(([d]) => !(WEEKDAY[d] === 0 || WEEKDAY[d] === 6));
  const per = (xs: typeof days) => (xs.length ? total(xs).coin / xs.length : NaN);

  const points: DayPoint[] = days.map(([d, s], k) => {
    const win = days.slice(Math.max(0, k - 6), k + 1);
    return { date: DATES[d], coin: s.coin, avg7: win.length === 7 ? total(win).coin / 7 : null, occupancy: s.oh / s.ah, closed: s.wc === 1 };
  });

  const mm = new Map<string, { coin: number; n: number }>();
  for (const [d, s] of days) {
    const m = MONTHS[Number(DATES[d].slice(5, 7)) - 1];
    const x = mm.get(m) ?? { coin: 0, n: 0 };
    x.coin += s.coin; x.n++; mm.set(m, x);
  }

  // zones over the period (always all zones, so the selected one can be compared)
  const zz = new Map<string, { coin: number; ah: number; oh: number; ent: number; cov: number; days: Set<number> }>();
  for (let i = 0; i < R.d.length; i++) {
    const date = DATES[R.d[i]];
    if (date < from || date > to) continue;
    const z = zz.get(R.z[i]) ?? { coin: 0, ah: 0, oh: 0, ent: 0, cov: 0, days: new Set<number>() };
    z.coin += R.coin[i]; z.ah += R.ah[i]; z.oh += R.oh[i]; z.days.add(R.d[i]);
    if (R.ent[i] != null && R.cov[i] != null) { z.ent += R.ent[i]!; z.cov += R.cov[i]!; }
    zz.set(R.z[i], z);
  }
  const zones: ZoneRow[] = [...zz.entries()]
    .map(([id, z]) => ({ id, name: zoneName(id), coinPerHour: z.coin / z.ah, occupancy: z.oh / z.ah, traffic: z.cov > 0 ? z.ent / z.cov : null, coinPerDay: z.coin / z.days.size }))
    .sort((a, b) => b.coinPerHour - a.coinPerHour);

  const closedDates = DATES.filter((_, d) => R.wc.some((w, i) => w === 1 && R.d[i] === d));
  return {
    scopeName: zone ? zoneName(zone) : "the floor",
    days: points,
    coinPerDay,
    vsHalfYear: halfYear ? coinPerDay / halfYear - 1 : NaN,
    weekendLift: per(we) / per(wd) - 1,
    occupancy: t.oh / t.ah,
    months: [...mm.entries()].map(([month, x]) => ({ month, coinPerDay: x.coin / x.n })),
    zones,
    events: data.events.map((e) => ({ ...e, inPeriod: e.end_date >= from && e.start_date <= to })),
    walkway: data.walkway.map((w) => ({ area: w.area, period: w.period.replace(/^\d /, ""), days: w.days, occupancy: w.occupancy, cpah: w.cpah, traffic: Number(w.entries_per_covered_hour) })),
    closure: closedDates.length ? { from: closedDates[0], to: closedDates[closedDates.length - 1] } : null,
  };
}

const usd = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e4 ? `$${Math.round(x / 1000).toLocaleString("en-US")}k` : `$${Math.round(x).toLocaleString("en-US")}`);
const pct = (x: number) => (Math.round(x * 100) === 0 ? "0%" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)}%`);

/** Plain answer, generated from the numbers for the chosen period and zone. */
export function q2Sentence(r: Q2Result, periodIsFull: boolean): string {
  const parts: string[] = [];
  parts.push(`${r.scopeName === "the floor" ? "The floor" : r.scopeName} took ${usd(r.coinPerDay)} a day in coin-in`);
  if (!periodIsFull && Number.isFinite(r.vsHalfYear)) parts[0] += ` (${pct(r.vsHalfYear)} vs its Jan–Jun average)`;
  if (r.months.length >= 2) {
    const hi = r.months.reduce((a, b) => (b.coinPerDay > a.coinPerDay ? b : a));
    const lo = r.months.reduce((a, b) => (b.coinPerDay < a.coinPerDay ? b : a));
    parts.push(`busiest month ${hi.month}, quietest ${lo.month} (${pct(lo.coinPerDay / hi.coinPerDay - 1)})`);
  }
  if (Number.isFinite(r.weekendLift)) parts.push(`weekends run ${pct(r.weekendLift)} vs weekdays`);
  const ev = r.events.filter((e) => e.inPeriod).sort((a, b) => b.uplift - a.uplift)[0];
  if (ev && ev.uplift_lo > 1) parts.push(`the biggest event lift was ${ev.name} (${pct(ev.uplift - 1)})`);
  return parts.join("; ") + ".";
}

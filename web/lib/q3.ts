import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// Q3: how much play was lost to downtime, and when? Data: web/data/q3.json (royale/export_app.py, from
// the Databricks gold tables). Lost play is valued hour by hour at the zone's coin-in rate for that hour
// and weekday x the machine's hold (D-027, claim C12): an upper bound, since some players move to a neighbour.

type Cols<T> = { [K in keyof T]: T[K][] };
type Q3Data = {
  meta: { generated_at: string; source: string };
  zones: { zone_id: string; name: string }[];
  banks: { bank_id: string; zone_id: string }[];
  down: Cols<{ m: string; d: string; z: string; b: string; mk: string; h: number; coin: number; theo: number }>;
  tickets: Cols<{ d: string; shift: string; z: string; b: string; mk: string; w: number; h: number }>;
  shifts: Cols<{ d: string; shift: string; p: number; a: number; f: number; w: number }>;
  maker_days: Cols<{ d: string; mk: string; n: number; machines: number }>;
};

const data: Q3Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q3.json"), "utf8"));
export const Q3_META = data.meta;
export const Q3_ZONES = data.zones;
export const Q3_BANKS = data.banks;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Q3Result = {
  scopeName: string;
  lostTheo: number;
  lostCoin: number;
  downHours: number;
  faults: number;
  avgWait: number;
  months: { month: string; lostTheo: number; downHours: number }[];
  staffing: { label: string; shifts: number; faultsPerShift: number; avgWait: number }[];
  byShift: { shift: string; planned: number; actual: number; avgWait: number; faults: number }[];
  makers: { maker: string; machines: number; faultsPer1000: number; lostTheo: number }[];
  topMachines: { id: string; bank: string; zone: string; maker: string; downHours: number; lostTheo: number }[];
};

export function computeQ3(from: string, to: string, zone?: string, bank?: string): Q3Result {
  const inScope = (d: string, z: string, b: string) => d >= from && d <= to && (!zone || z === zone) && (!bank || b === bank);
  const D = data.down, T = data.tickets, S = data.shifts, M = data.maker_days;

  let lostTheo = 0, lostCoin = 0, downHours = 0;
  const mon = new Map<string, { lostTheo: number; downHours: number }>();
  const mach = new Map<string, { bank: string; zone: string; maker: string; downHours: number; lostTheo: number }>();
  const makerLost = new Map<string, number>();
  for (let i = 0; i < D.m.length; i++) {
    if (!inScope(D.d[i], D.z[i], D.b[i])) continue;
    lostTheo += D.theo[i]; lostCoin += D.coin[i]; downHours += D.h[i];
    const m = MONTHS[Number(D.d[i].slice(5, 7)) - 1];
    const x = mon.get(m) ?? { lostTheo: 0, downHours: 0 };
    x.lostTheo += D.theo[i]; x.downHours += D.h[i]; mon.set(m, x);
    const y = mach.get(D.m[i]) ?? { bank: D.b[i], zone: D.z[i], maker: D.mk[i], downHours: 0, lostTheo: 0 };
    y.downHours += D.h[i]; y.lostTheo += D.theo[i]; mach.set(D.m[i], y);
    makerLost.set(D.mk[i], (makerLost.get(D.mk[i]) ?? 0) + D.theo[i]);
  }

  let faults = 0, wait = 0;
  const makerFaults = new Map<string, number>();
  for (let i = 0; i < T.d.length; i++) {
    if (!inScope(T.d[i], T.z[i], T.b[i])) continue;
    faults++; wait += T.w[i];
    makerFaults.set(T.mk[i], (makerFaults.get(T.mk[i]) ?? 0) + 1);
  }

  // staffing is floor-wide (techs cover the whole floor), so it uses the period only
  const st = { short: { n: 0, f: 0, w: 0 }, full: { n: 0, f: 0, w: 0 } };
  const sh = new Map<string, { planned: number; actual: number; f: number; w: number }>();
  for (let i = 0; i < S.d.length; i++) {
    if (S.d[i] < from || S.d[i] > to) continue;
    const k = S.a[i] < S.p[i] ? st.short : st.full;
    k.n++; k.f += S.f[i]; k.w += S.w[i];
    const x = sh.get(S.shift[i]) ?? { planned: 0, actual: 0, f: 0, w: 0 };
    x.planned += S.p[i]; x.actual += S.a[i]; x.f += S.f[i]; x.w += S.w[i]; sh.set(S.shift[i], x);
  }

  // faults per 1,000 machine-days by maker: machine-days are floor-wide, so maker rates use the period only
  const mdays = new Map<string, { n: number; machines: number }>();
  for (let i = 0; i < M.d.length; i++) {
    if (M.d[i] < from || M.d[i] > to) continue;
    const x = mdays.get(M.mk[i]) ?? { n: 0, machines: 0 };
    x.n += M.n[i]; x.machines = Math.max(x.machines, M.machines[i]); mdays.set(M.mk[i], x);
  }
  const floorFaults = new Map<string, number>();
  for (let i = 0; i < T.d.length; i++) if (T.d[i] >= from && T.d[i] <= to) floorFaults.set(T.mk[i], (floorFaults.get(T.mk[i]) ?? 0) + 1);
  const floorLost = new Map<string, number>();
  for (let i = 0; i < D.d.length; i++) if (D.d[i] >= from && D.d[i] <= to) floorLost.set(D.mk[i], (floorLost.get(D.mk[i]) ?? 0) + D.theo[i]);

  const zoneName = zone ? data.zones.find((z) => z.zone_id === zone)?.name ?? zone : undefined;
  return {
    scopeName: bank ? `bank ${bank}` : zoneName ?? "the floor",
    lostTheo, lostCoin, downHours, faults,
    avgWait: faults ? wait / faults : NaN,
    months: MONTHS.filter((m) => mon.has(m)).map((m) => ({ month: m, ...mon.get(m)! })),
    staffing: [
      { label: "Short of slot techs", shifts: st.short.n, faultsPerShift: st.short.f / Math.max(st.short.n, 1), avgWait: st.short.f ? st.short.w / st.short.f : NaN },
      { label: "Fully staffed", shifts: st.full.n, faultsPerShift: st.full.f / Math.max(st.full.n, 1), avgWait: st.full.f ? st.full.w / st.full.f : NaN },
    ],
    byShift: ["day", "swing", "grave"].filter((s) => sh.has(s)).map((s) => { const x = sh.get(s)!; return { shift: s, planned: x.planned, actual: x.actual, faults: x.f, avgWait: x.f ? x.w / x.f : NaN }; }),
    makers: [...mdays.entries()].map(([maker, x]) => ({ maker, machines: x.machines, faultsPer1000: ((floorFaults.get(maker) ?? 0) * 1000) / x.n, lostTheo: floorLost.get(maker) ?? 0 }))
      .sort((a, b) => b.faultsPer1000 - a.faultsPer1000),
    topMachines: [...mach.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => b.lostTheo - a.lostTheo).slice(0, 10),
  };
}

const k = (x: number) => (x >= 10000 ? `$${Math.round(x / 1000).toLocaleString("en-US")}k` : `$${Math.round(x).toLocaleString("en-US")}`);

export function q3Sentence(r: Q3Result): string {
  const parts = [`Downtime cost ${r.scopeName} about ${k(r.lostTheo)} of expected earnings (${Math.round(r.downHours).toLocaleString("en-US")} machine-hours down)`];
  if (r.months.length >= 2) {
    const worst = r.months.reduce((a, b) => (b.lostTheo > a.lostTheo ? b : a));
    parts[0] += `, worst in ${worst.month}`;
  }
  const [short, full] = r.staffing;
  if (short.shifts >= 5 && Number.isFinite(short.avgWait) && Number.isFinite(full.avgWait))
    parts.push(`repairs waited ${short.avgWait.toFixed(1)} h on shifts short of slot techs vs ${full.avgWait.toFixed(1)} h when fully staffed`);
  if (r.makers.length >= 2) {
    const [top, ...rest] = r.makers;
    const others = rest.reduce((a, m) => a + m.faultsPer1000, 0) / rest.length;
    if (others > 0 && top.faultsPer1000 / others > 1.5) parts.push(`${top.maker} machines break down ${(top.faultsPer1000 / others).toFixed(1)}× as often as the other makers`);
  }
  return parts.join("; ") + ".";
}

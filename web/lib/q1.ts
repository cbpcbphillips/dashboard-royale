import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { holm, normCdf, normInv, poissonSf, ratioTest } from "./stats";

type Q1Data = {
  meta: { generated_at: string; source: string; tau2: number; window: [string, string]; manifest_sha256_16: string; notes: string };
  machines: { machine_id: string; manufacturer: string; theme: string; lease_class: string; install_date: string | null; retire_date: string | null }[];
  configs: { config_id: string; theme: string; rtp: number; volatility_class: string }[];
  zones: { zone_id: string; name: string; x_m: number; y_m: number }[];
  banks: { bank_id: string; zone_id: string; name: string; x_m: number; y_m: number }[];
  slots: { location_id: string; zone_id: string; bank_id: string; x_m: number; y_m: number }[];
  dates: string[];
  rows: {
    m: number[]; d: number[]; s: number[]; bank: string[]; zone: string[]; cfg: string[]; maker: string[];
    theo: number[]; hw: number[]; coin: number[]; et: number[]; ah: number[]; sh: number[]; oh: number[]; lv: number[]; f: number[];
  };
};

// Read once at module scope: the file is static (exported by royale/export_app.py), so this is a
// predictable value for Next.js prerendering, and it never reaches the browser.
const data: Q1Data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "q1.json"), "utf8"));

// Q1: which machines are truly underperforming? (spec: docs/Q1.md; Python twin: royale/q1_reference.py)
// Data: web/data/q1.json, exported from the Databricks gold tables (D-057). Everything recomputes for
// any date range from per-day numbers, including the leave-one-out expected earnings (D-076).

const ALPHA = 0.05;
const MIN_DAYS = 30;
const SHORT_WINDOW_DAYS = 56;
// D-085: one big jackpot can look like a payout fault on a short period, so the payout check only runs on 8+ weeks,
// and a quiet spot must be both proven and materially quiet (bank at most 90% of the floor's time in use).
const PAYOUT_MIN_DAYS = SHORT_WINDOW_DAYS;
const QUIET_MAX_RATIO = 0.9;

const R = data.rows;
const DATES: string[] = data.dates;
const N = R.m.length;

export const META = data.meta;
export const SLOTS = data.slots;
export const ZONES = data.zones;
export const BANKS = data.banks;
const MACHINES = data.machines;
const CONFIGS = new Map(data.configs.map((c) => [c.config_id, c]));

/** Monday-start week key for a YYYY-MM-DD gaming date (matches pandas W-SUN periods). */
function weekKey(iso: string) {
  const t = Date.parse(iso + "T00:00:00Z");
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return Math.floor((t - ((dow + 6) % 7) * 86400000) / 86400000);
}
const WEEK = DATES.map(weekKey);

// D-082 "same days": scale each machine's daily prediction by how the REST of the floor did against its
// predictions that day, so a floor-wide good or bad day doesn't count for or against one machine.
// Days are whole, so this is the same for every period; computed once.
const ET: number[] = (() => {
  const dayTheo = new Array(DATES.length).fill(0), dayEt = new Array(DATES.length).fill(0);
  for (let i = 0; i < N; i++) { dayTheo[R.d[i]] += R.theo[i]; dayEt[R.d[i]] += R.et[i]; }
  return R.et.map((e, i) => e * (dayTheo[R.d[i]] - R.theo[i]) / (dayEt[R.d[i]] - e));
})();

export type LabelKey = "quiet" | "lowSample" | "down" | "paying" | "unpopular" | "normal";
export type Label = { key: LabelKey; text: string; detail: string };

export type MachineResult = {
  id: string;
  theme: string;
  configId: string;
  maker: string;
  zoneId: string;
  zoneName: string;
  bankId: string;
  slot: number;
  days: number;
  retired: boolean;
  // play
  theo: number;
  expected: number;
  ratio: number;
  playZ: number;
  playP: number;
  playPHolm: number;
  weight: number;
  playShort: number;
  shrunkGap: number;
  rawGap: number;
  // luck / payout
  houseWin: number;
  luck: number;
  luckZ: number;
  luckP: number;
  luckPHolm: number;
  // availability
  faults: number;
  faultsExpected: number;
  availP: number;
  availPHolm: number;
  // exposure (bank)
  bankRatio: number;
  bankPHolm: number;
  // basic totals for the period
  coinIn: number;
  openHours: number;
  scheduledHours: number;
  occupiedHours: number;
  occVsBankMates: number;
  uptimeVsMaker: number;
  // measures
  tpah: number;
  cpah: number;
  uptime: number;
  occupancy: number;
  // result
  score: number;
  rank: number;
  labels: Label[];
  ranks: Record<"tpah" | "cpah" | "uptime" | "occupancy" | "luck", number>;
};

export type Q1Result = {
  from: string;
  to: string;
  periodDays: number;
  shortWindow: boolean;
  machines: MachineResult[];
  floor: { tpah: number; cpah: number; occupancy: number; uptime: number; machines: number };
  counts: Record<LabelKey, number>;
  zCrit: number;
};

const money = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

export function computeQ1(from: string, to: string): Q1Result {
  const d0 = DATES.findIndex((d) => d >= from);
  let d1 = DATES.length - 1;
  while (d1 >= 0 && DATES[d1] > to) d1--;
  const periodDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

  // --- one pass: per machine, per bank, per week sums ---
  type Acc = {
    theo: number; et: number; hw: number; coin: number; ah: number; sh: number; oh: number; lv: number; f: number; days: number;
    weeks: Map<number, { a: number; e: number }>; lastD: number; slot: number; bank: string; zone: string; cfg: string; maker: string;
  };
  const acc = new Map<number, Acc>();
  const bankWeek = new Map<string, Map<number, { oh: number; ah: number }>>();
  const floorWeek = new Map<number, { oh: number; ah: number }>();
  const makerF = new Map<string, { f: number; n: number; ah: number; sh: number }>();
  const bankTot = new Map<string, { oh: number; ah: number }>();
  const ownInBank = new Map<string, { oh: number; ah: number }>();
  let floorTheo = 0, floorAh = 0, floorOh = 0, floorSh = 0, floorCoin = 0;

  if (d0 >= 0 && d1 >= d0) {
    for (let i = 0; i < N; i++) {
      const d = R.d[i];
      if (d < d0 || d > d1) continue;
      const m = R.m[i];
      const w = WEEK[d];
      let a = acc.get(m);
      if (!a) {
        a = { theo: 0, et: 0, hw: 0, coin: 0, ah: 0, sh: 0, oh: 0, lv: 0, f: 0, days: 0, weeks: new Map(), lastD: -1, slot: -1, bank: "", zone: "", cfg: "", maker: "" };
        acc.set(m, a);
      }
      a.theo += R.theo[i]; a.et += ET[i]; a.hw += R.hw[i]; a.coin += R.coin[i];
      a.ah += R.ah[i]; a.sh += R.sh[i]; a.oh += R.oh[i]; a.lv += R.lv[i]; a.f += R.f[i]; a.days++;
      const wk = a.weeks.get(w) ?? { a: 0, e: 0 };
      wk.a += R.theo[i]; wk.e += ET[i]; a.weeks.set(w, wk);
      if (d >= a.lastD) { a.lastD = d; a.slot = R.s[i]; a.bank = R.bank[i]; a.zone = R.zone[i]; a.cfg = R.cfg[i]; a.maker = R.maker[i]; }

      const bw = bankWeek.get(R.bank[i]) ?? new Map();
      const b = bw.get(w) ?? { oh: 0, ah: 0 };
      b.oh += R.oh[i]; b.ah += R.ah[i]; bw.set(w, b); bankWeek.set(R.bank[i], bw);
      const fw = floorWeek.get(w) ?? { oh: 0, ah: 0 };
      fw.oh += R.oh[i]; fw.ah += R.ah[i]; floorWeek.set(w, fw);
      const mf = makerF.get(R.maker[i]) ?? { f: 0, n: 0, ah: 0, sh: 0 };
      mf.f += R.f[i]; mf.n++; mf.ah += R.ah[i]; mf.sh += R.sh[i]; makerF.set(R.maker[i], mf);
      const bt = bankTot.get(R.bank[i]) ?? { oh: 0, ah: 0 };
      bt.oh += R.oh[i]; bt.ah += R.ah[i]; bankTot.set(R.bank[i], bt);
      const ok = `${m}|${R.bank[i]}`;
      const ob = ownInBank.get(ok) ?? { oh: 0, ah: 0 };
      ob.oh += R.oh[i]; ob.ah += R.ah[i]; ownInBank.set(ok, ob);
      floorTheo += R.theo[i]; floorCoin += R.coin[i]; floorAh += R.ah[i]; floorOh += R.oh[i]; floorSh += R.sh[i];
    }
  }

  // --- exposure: each bank's occupancy vs the floor's, week by week ---
  const bankStats = new Map<string, { ratio: number; p: number }>();
  for (const [bank, weeks] of bankWeek) {
    const ws = [...weeks.keys()].sort((x, y) => x - y);
    const a = ws.map((w) => weeks.get(w)!.oh);
    const e = ws.map((w) => { const fw = floorWeek.get(w)!; return weeks.get(w)!.ah * (fw.oh / fw.ah); });
    const t = ratioTest(a, e);
    bankStats.set(bank, { ratio: t.R, p: t.p });
  }
  const bankIds = [...bankStats.keys()];
  const bankHolm = holm(bankIds.map((b) => bankStats.get(b)!.p));
  const bankPHolm = new Map(bankIds.map((b, i) => [b, bankHolm[i]]));

  // --- per machine ---
  const tau2 = META.tau2;
  const ms: MachineResult[] = [];
  for (const [mi, a] of acc) {
    const ws = [...a.weeks.keys()].sort((x, y) => x - y);
    const t = ratioTest(ws.map((w) => a.weeks.get(w)!.a), ws.map((w) => a.weeks.get(w)!.e));
    const weight = Number.isFinite(t.se) ? tau2 / (tau2 + t.se * t.se) : 0;
    const sd = Math.sqrt(a.lv) / 100;
    const luck = a.hw - a.theo;
    const mf = makerF.get(a.maker)!;
    const lam = (mf.f / mf.n) * a.days;
    const meta = MACHINES[mi];
    const cfg = CONFIGS.get(a.cfg);
    ms.push({
      id: meta.machine_id,
      theme: cfg?.theme ?? meta.theme,
      configId: a.cfg,
      maker: a.maker,
      zoneId: a.zone,
      zoneName: ZONES.find((z) => z.zone_id === a.zone)?.name ?? a.zone,
      bankId: a.bank,
      slot: a.slot,
      days: a.days,
      retired: !!meta.retire_date && meta.retire_date <= to,
      theo: a.theo,
      expected: a.et,
      ratio: t.R,
      playZ: t.z,
      playP: t.p,
      playPHolm: NaN,
      weight,
      playShort: weight * (a.et - a.theo),
      shrunkGap: weight * (1 - t.R),
      rawGap: 1 - t.R,
      houseWin: a.hw,
      luck,
      luckZ: sd > 0 ? luck / sd : NaN,
      luckP: sd > 0 ? normCdf(luck / sd) : NaN,
      luckPHolm: NaN,
      faults: a.f,
      faultsExpected: lam,
      availP: lam > 0 ? poissonSf(a.f, lam) : NaN,
      availPHolm: NaN,
      bankRatio: bankStats.get(a.bank)?.ratio ?? NaN,
      bankPHolm: bankPHolm.get(a.bank) ?? NaN,
      coinIn: a.coin,
      openHours: a.ah,
      scheduledHours: a.sh,
      occupiedHours: a.oh,
      occVsBankMates: (() => { const bt = bankTot.get(a.bank)!; const ob = ownInBank.get(`${mi}|${a.bank}`) ?? { oh: 0, ah: 0 }; const rest = (bt.oh - ob.oh) / (bt.ah - ob.ah); return a.oh / a.ah / rest; })(),
      uptimeVsMaker: a.ah / a.sh - mf.ah / mf.sh,
      tpah: a.theo / a.ah,
      cpah: a.coin / a.ah,
      uptime: a.ah / a.sh,
      occupancy: a.oh / a.ah,
      score: 0,
      rank: 0,
      labels: [],
      ranks: { tpah: 0, cpah: 0, uptime: 0, occupancy: 0, luck: 0 },
    });
  }

  // Holm across all machines on the floor in the period (labels don't change when the view is filtered)
  const ph = holm(ms.map((m) => m.playP));
  const lh = holm(ms.map((m) => m.luckP));
  const ah = holm(ms.map((m) => m.availP));
  ms.forEach((m, i) => { m.playPHolm = ph[i]; m.luckPHolm = lh[i]; m.availPHolm = ah[i]; });
  const zCrit = normInv(1 - ALPHA / Math.max(ms.length, 1));
  const minDays = Math.min(MIN_DAYS, periodDays);
  const monthsToSettle = (m: MachineResult, z: number) => Math.max(1, Math.round((m.days * ((zCrit / z) ** 2 - 1)) / 30.4));

  for (const m of ms) {
    const L: Label[] = [];
    if (m.bankPHolm < ALPHA && m.bankRatio <= QUIET_MAX_RATIO)
      L.push({ key: "quiet", text: "Quiet spot", detail: `Its bank (${m.bankId}) is played ${Math.round(m.bankRatio * 100)}% as much as the floor average.` });
    if (m.availPHolm < ALPHA)
      L.push({ key: "down", text: "Down too often", detail: `${m.faults} breakdowns vs about ${m.faultsExpected.toFixed(1)} normal for a ${m.maker} machine over ${m.days} days.` });
    const payoutTested = periodDays >= PAYOUT_MIN_DAYS;
    const paying = payoutTested && m.luckPHolm < ALPHA;
    if (paying)
      L.push({ key: "paying", text: "Paying too much: inspect", detail: `Kept ${money(m.luck)} less than its game settings imply. That is too much to be chance; a lead to inspect, not an accusation.` });
    if (m.playPHolm < ALPHA)
      L.push({ key: "unpopular", text: "Unpopular unit", detail: `Played about ${Math.round(m.shrunkGap * 100)}% less than identical machines in the same kind of spot (raw gap ${Math.round(m.rawGap * 100)}%).` });
    if (m.days < minDays) L.push({ key: "lowSample", text: "Low sample size", detail: `Only ${m.days} days on the floor in this period.` });
    else {
      const unconfirmed: [string, number][] = [];
      if (m.playPHolm >= ALPHA && m.playP < ALPHA) unconfirmed.push(["play", m.playZ]);
      if (payoutTested && !paying && m.luckP < ALPHA) unconfirmed.push(["payout", m.luckZ]);
      if (m.availPHolm >= ALPHA && m.availP < ALPHA) unconfirmed.push(["uptime", normInv(m.availP)]);
      if (!payoutTested && m.luckP < ALPHA)
        L.push({ key: "lowSample", text: "Low sample size", detail: `Kept ${money(m.luck)} less than its game settings imply this period. One big payout can do that; the payout check needs at least 8 weeks of data.` });
      else if (unconfirmed.length) {
        const [what, z] = unconfirmed.sort((x, y) => x[1] - y[1])[0];
        L.push({ key: "lowSample", text: "Low sample size", detail: `Looks low on ${what}; about ${monthsToSettle(m, z)} more months of similar results would confirm it.` });
      }
    }
    if (!L.length) L.push({ key: "normal", text: "Normal", detail: "Nothing proven: play, payout, uptime and spot are all within normal ranges." });
    m.labels = L;
    m.score = m.playShort + (paying ? Math.max(-m.luck, 0) : 0);
  }

  ms.sort((x, y) => y.score - x.score);
  ms.forEach((m, i) => (m.rank = i + 1));
  const rankBy = (key: (m: MachineResult) => number) => {
    const vals = ms.map(key);
    return (v: number) => vals.filter((x) => x > v).length + 1;
  };
  const rk = {
    tpah: rankBy((m) => m.tpah), cpah: rankBy((m) => m.cpah), uptime: rankBy((m) => m.uptime),
    occupancy: rankBy((m) => m.occupancy), luck: rankBy((m) => m.luckZ),
  };
  for (const m of ms) m.ranks = { tpah: rk.tpah(m.tpah), cpah: rk.cpah(m.cpah), uptime: rk.uptime(m.uptime), occupancy: rk.occupancy(m.occupancy), luck: rk.luck(m.luckZ) };

  const counts = { quiet: 0, lowSample: 0, down: 0, paying: 0, unpopular: 0, normal: 0 } as Record<LabelKey, number>;
  for (const m of ms) for (const l of m.labels) counts[l.key]++;

  return {
    from, to, periodDays, shortWindow: periodDays < SHORT_WINDOW_DAYS, machines: ms, counts, zCrit,
    floor: { tpah: floorTheo / floorAh, cpah: floorCoin / floorAh, occupancy: floorOh / floorAh, uptime: floorAh / floorSh, machines: ms.length },
  };
}

/** One plain sentence, generated from the results (never hard-coded). */
export function answerSentence(r: Q1Result, inScope: MachineResult[]): string | null {
  if (!inScope.length) return null;
  const c = (k: LabelKey) => inScope.filter((m) => m.labels.some((l) => l.key === k)).length;
  const parts: string[] = [];
  const unpop = c("unpopular"), paying = c("paying"), down = c("down"), quiet = c("quiet");
  if (unpop) parts.push(`${unpop} ${unpop === 1 ? "machine gets" : "machines get"} clearly less play than identical machines in the same kind of spot`);
  if (paying) parts.push(`${paying} ${parts.length ? "" : paying === 1 ? "machine " : "machines "}${paying === 1 ? "is" : "are"} paying out too much and should be inspected`);
  if (down) parts.push(`${down} ${down === 1 ? "breaks" : "break"} down more than normal`);
  if (!parts.length) parts.push(r.shortWindow || r.periodDays < 120 ? "no single machine can be proven to underperform with this much data (the full six months can prove more)" : "no machine is clearly underperforming once its spot, game and luck are accounted for");
  let s = parts.join("; ");
  if (quiet) s += `. ${quiet} of the ${inScope.length} sit in quiet spots, which explains most low earnings there`;
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

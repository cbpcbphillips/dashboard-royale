"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

export type MapSlot = { id: string; x: number; y: number; zone: string; bank: string; machine?: string };
export type MapMachine = {
  id: string;
  labels: string[];
  earnVsExpected: number; earnVsFloor: number; coinVsFloor: number;
  luckZ: number; occVsExpected: number; occVsFloor: number; uptimeVsExpected: number; uptimeVsFloor: number;
};
type Measure = "earn" | "coin" | "luck" | "occ" | "uptime";
type Basis = "expected" | "floor";

const MEASURES: { key: Measure; label: string }[] = [
  { key: "earn", label: "Earnings (luck removed)" },
  { key: "coin", label: "Coin-in (amount played)" },
  { key: "luck", label: "Luck (actual vs expected win)" },
  { key: "occ", label: "Exposure (time in use)" },
  { key: "uptime", label: "Availability (uptime)" },
];
const BASES: { key: Basis; label: string }[] = [
  { key: "expected", label: "its expected value" },
  { key: "floor", label: "the floor average" },
];
const pctFmt = (d: number) => (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`;
const ptsFmt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(2)} pts`;

/** What to plot for a measure × basis, with the plain explanation shown under the legend. */
function view(measure: Measure, basis: Basis): { key: keyof MapMachine; fmt: (v: number) => string; unit: string; fixedMax?: number; note?: string } {
  switch (measure) {
    case "earn":
      return basis === "expected"
        ? { key: "earnVsExpected", fmt: pctFmt(1), unit: "vs what similar machines in the same kind of spot predict (best estimate, same as the ranking)" }
        : { key: "earnVsFloor", fmt: pctFmt(0), unit: "expected win per open hour vs the floor average (spot not accounted for)" };
    case "coin":
      return basis === "expected"
        ? { key: "earnVsExpected", fmt: pctFmt(1), unit: "vs prediction", note: "Coin-in vs expected is the same as earnings vs expected: each game keeps a fixed share of every dollar played." }
        : { key: "coinVsFloor", fmt: pctFmt(0), unit: "coin-in per open hour vs the floor average" };
    case "luck":
      return { key: "luckZ", fmt: (v) => `z ${v.toFixed(1)}`, unit: "actual minus expected win, in units of normal luck (±2 unusual, ±3 very unusual)", fixedMax: 3,
        note: basis === "floor" ? "Luck is already “actual vs expected”, so it is shown against its expected value." : undefined };
    case "occ":
      return basis === "expected"
        ? { key: "occVsExpected", fmt: pctFmt(0), unit: "time in use vs its bank-mates (its expected exposure)" }
        : { key: "occVsFloor", fmt: pctFmt(0), unit: "time in use vs the floor average" };
    case "uptime":
      return basis === "expected"
        ? { key: "uptimeVsExpected", fmt: ptsFmt, unit: "uptime vs the normal for its maker (percentage points)" }
        : { key: "uptimeVsFloor", fmt: ptsFmt, unit: "uptime vs the floor average (percentage points)" };
  }
}

// Diverging scales with a neutral grey midpoint. Default: green = better, red = worse (D-049);
// colour-blind mode: blue = better, red = worse.
const SCALES = {
  normal: { good: [26, 152, 80], bad: [215, 48, 39], mid: [232, 228, 226] },
  cb: { good: [42, 120, 214], bad: [215, 48, 39], mid: [232, 228, 226] },
};

function colour(v: number, max: number, cb: boolean) {
  if (!Number.isFinite(v)) return "transparent";
  const s = cb ? SCALES.cb : SCALES.normal;
  const t = Math.max(-1, Math.min(1, v / (max || 1)));
  const end = t >= 0 ? s.good : s.bad;
  const a = Math.abs(t);
  const c = s.mid.map((m, i) => Math.round(m + (end[i] - m) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Floor plan: a dot per slot at its real coordinates, coloured by the chosen measure; click selects a machine. */
export function FloorMap({ slots, machines, zones, selected, scope }: { slots: MapSlot[]; machines: MapMachine[]; zones: { id: string; name: string; x: number; y: number }[]; selected?: string; scope?: { zone?: string; bank?: string } }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [measure, setMeasure] = useState<Measure>("earn");
  const [basis, setBasis] = useState<Basis>("expected");
  const [cb, setCb] = useState(false);
  const [hover, setHover] = useState<{ slot: MapSlot; x: number; y: number } | null>(null);

  useEffect(() => {
    try { setCb(localStorage.getItem("colourblind") === "1"); } catch {}
  }, []);
  function toggleCb() {
    setCb((v) => { try { localStorage.setItem("colourblind", v ? "0" : "1"); } catch {} return !v; });
  }

  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const v = view(measure, basis);
  const metric = v.key as Exclude<keyof MapMachine, "id" | "labels">;
  const shownBasis: Basis = measure === "luck" ? "expected" : basis; // luck is always actual vs expected
  const label = `${MEASURES.find((x) => x.key === measure)!.label} vs ${BASES.find((x) => x.key === shownBasis)!.label}`;
  const m = { label, fmt: v.fmt, unit: v.unit };
  const max = useMemo(() => {
    if (v.fixedMax) return v.fixedMax;
    const vals = machines.map((x) => Math.abs(x[metric])).filter(Number.isFinite).sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.95)] || 1;
  }, [machines, metric, v.fixedMax]);

  const xs = slots.map((s) => s.x), ys = slots.map((s) => s.y);
  const pad = 6;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const W = maxX - minX, H = maxY - minY;

  function select(id: string) {
    const q = new URLSearchParams(params.toString());
    q.set("machine", id);
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
    if (window.matchMedia("(max-width: 1099px)").matches) setTimeout(() => document.getElementById("machine-card")?.scrollIntoView({ behavior: "smooth" }), 300);
  }

  const legend = [-1, -0.5, 0, 0.5, 1];
  return (
    <div className="floormap">
      <div className="map-controls">
        <label className="filter">
          Measure
          <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
            {MEASURES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <label className="filter">
          Compared with
          <select value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
            {BASES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <button type="button" className={`toggle-btn${cb ? " on" : ""}`} aria-pressed={cb} onClick={toggleCb}>
          Colour-blind mode {cb ? "on" : "off"}
        </button>
      </div>
      <div className="map-legend" aria-hidden="true">
        <span>worse</span>
        {legend.map((t) => <i key={t} style={{ background: colour(t * max, max, cb) }} />)}
        <span>better</span>
        <span className="note">{m.unit}; hollow = empty slot</span>
      </div>
      {v.note && <p className="map-note">{v.note}</p>}
      <div className="map-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`${minX} ${minY} ${W} ${H}`} role="img" aria-label={`Floor map of ${slots.length} slots coloured by ${m.label.toLowerCase()}. Click a dot to open that machine.`}>
          {zones.map((z) => (
            <text key={z.id} x={z.x} y={z.y - 3.5} className="zone-label" textAnchor="middle">{z.name}</text>
          ))}
          {slots.map((s) => {
            const mm = s.machine ? byId.get(s.machine) : undefined;
            const v = mm ? mm[metric] : NaN;
            const isSel = s.machine && s.machine === selected;
            return (
              <circle
                key={s.id}
                cx={s.x}
                cy={s.y}
                r={isSel ? 1.75 : 1.3}
                fill={mm ? colour(v, max, cb) : "none"}
                opacity={(scope?.bank && s.bank !== scope.bank) || (scope?.zone && s.zone !== scope.zone) ? 0.18 : 1}
                stroke={isSel ? "var(--ink)" : mm ? "rgba(58,16,33,.35)" : "var(--muted)"}
                strokeWidth={isSel ? 0.5 : 0.18}
                tabIndex={mm ? 0 : -1}
                role={mm ? "button" : undefined}
                aria-label={mm ? `${mm.id}: ${m.label} ${m.fmt(v)}` : `Empty slot ${s.id}`}
                style={{ cursor: mm ? "pointer" : "default" }}
                onMouseEnter={(e) => setHover({ slot: s, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
                onFocus={() => setHover({ slot: s, x: 12, y: 12 })}
                onClick={() => mm && select(mm.id)}
                onKeyDown={(e) => mm && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(mm.id))}
              />
            );
          })}
        </svg>
        {hover && (
          <div className="map-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
            {hover.slot.machine && byId.get(hover.slot.machine) ? (
              <>
                <b>{hover.slot.machine}</b> · bank {hover.slot.bank}
                <div>{m.label}: {m.fmt(byId.get(hover.slot.machine)![metric])}</div>
                <div className="note">{byId.get(hover.slot.machine)!.labels.join(" · ")}</div>
              </>
            ) : (
              <>Empty slot {hover.slot.id}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

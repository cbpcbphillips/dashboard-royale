"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { LABEL_COLOR } from "./LabelChip";

export type ScatterPoint = { id: string; play: number; luckZ: number; label: "paying" | "unpopular" | "quiet" | "lowSample" | "down" | "normal"; labelText: string; inScope: boolean };

const ORDER: ScatterPoint["label"][] = ["normal", "lowSample", "quiet", "down", "unpopular", "paying"]; // draw the important ones last (on top)
const NAMES: Record<ScatterPoint["label"], string> = {
  paying: "Paying too much: inspect", unpopular: "Unpopular unit", quiet: "Quiet spot", lowSample: "Not proven yet / few days", down: "Down too often", normal: "Normal",
};

/** Luck vs play: every machine's play vs its prediction (x) against its luck (y). Separates the three explanations at a
 *  glance: a weak unit sits far left, a payout problem far down, ordinary luck in the middle band. Click a dot to open it. */
export function LuckPlayScatter({ points, zCrit, selected }: { points: ScatterPoint[]; zCrit: number; selected?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [hover, setHover] = useState<ScatterPoint | null>(null);

  const W = 720, H = 360, L = 52, R = 14, T = 16, B = 40;
  const XMAX = 0.3, YMAX = 6;
  const cx = (v: number) => L + ((Math.max(-XMAX, Math.min(XMAX, v)) + XMAX) / (2 * XMAX)) * (W - L - R);
  const cy = (v: number) => T + (1 - (Math.max(-YMAX, Math.min(YMAX, v)) + YMAX) / (2 * YMAX)) * (H - T - B);
  const select = (id: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("machine", id);
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
    document.getElementById("machine-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const shown = [...points].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  const present = ORDER.filter((k) => points.some((p) => p.label === k)).reverse();

  return (
    <div className="scatter">
      <div className="scatter-legend">
        {present.map((k) => (
          <span key={k} className="chip"><i style={{ background: LABEL_COLOR[k] }} aria-hidden="true" />{NAMES[k]}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Each machine's play versus prediction against its luck. ${points.filter((p) => p.label === "paying").map((p) => p.id).join(", ") || "No machine"} sits beyond the luck band.`}>
        <rect x={L} y={cy(zCrit)} width={W - L - R} height={cy(-zCrit) - cy(zCrit)} fill="var(--accent-soft)" />
        <text x={W - R - 4} y={cy(zCrit) + 13} textAnchor="end" className="sc-note">normal luck (within chance for {points.length} machines)</text>
        {[-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map((v) => (
          <g key={v}>
            <line x1={cx(v)} x2={cx(v)} y1={T} y2={H - B} stroke={v === 0 ? "var(--ink2)" : "var(--grid)"} strokeWidth={v === 0 ? 1 : 0.8} />
            <text x={cx(v)} y={H - B + 14} textAnchor="middle" className="sc-axis">{v === 0 ? "as predicted" : `${v > 0 ? "+" : "−"}${Math.abs(v * 100)}%`}</text>
          </g>
        ))}
        {[-6, -3, 0, 3, 6].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={cy(v)} y2={cy(v)} stroke={v === 0 ? "var(--ink2)" : "var(--grid)"} strokeWidth={v === 0 ? 1 : 0.8} />
            <text x={L - 6} y={cy(v) + 4} textAnchor="end" className="sc-axis">{v === 0 ? "0" : v > 0 ? `+${v}` : `−${-v}`}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="sc-title">← less play than identical machines nearby · play vs prediction · more play →</text>
        <text transform={`translate(13 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="sc-title">luck (z): ↓ kept less than its game settings imply</text>
        <text x={L + 6} y={H - B - 8} className="sc-corner">leak?</text>
        <text x={L + 6} y={T + 12} className="sc-corner">weak unit, lucky</text>
        {shown.map((p) => {
          const isSel = p.id === selected;
          return (
            <circle
              key={p.id}
              cx={cx(p.play)}
              cy={cy(p.luckZ)}
              r={isSel ? 6 : p.label === "paying" || p.label === "unpopular" ? 4.5 : 3.2}
              fill={LABEL_COLOR[p.label]}
              fillOpacity={p.inScope ? 0.9 : 0.18}
              stroke={isSel ? "var(--ink)" : "#fff"}
              strokeWidth={isSel ? 2 : 0.6}
              tabIndex={0}
              role="button"
              aria-label={`${p.id}: play ${p.play >= 0 ? "+" : "−"}${Math.abs(p.play * 100).toFixed(1)}% vs prediction, luck z ${p.luckZ.toFixed(1)}, ${p.labelText}`}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p)}
              onClick={() => select(p.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(p.id))}
            />
          );
        })}
      </svg>
      <p className="scatter-tip" aria-live="polite">
        {hover ? (
          <><b>{hover.id}</b> · play {hover.play >= 0 ? "+" : "−"}{Math.abs(hover.play * 100).toFixed(1)}% vs prediction · luck z {hover.luckZ.toFixed(1)} · {hover.labelText}</>
        ) : (
          "Hover or tab to a dot for details; click to open its card."
        )}
      </p>
    </div>
  );
}

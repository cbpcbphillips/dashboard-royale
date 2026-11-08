"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; coin: number; avg7: number | null };
type Band = { from: string; to: string; label: string; kind: "event" | "closure" };

const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`);
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Daily coin-in with a 7-day average; event days and the walkway closure shaded behind. */
export function DemandChart({ points, bands, summary }: { points: Point[]; bands: Band[]; summary: string }) {
  const inRange = (b: Band) => points.length && b.to >= points[0].date && b.from <= points[points.length - 1].date;
  const clip = (d: string, lo: boolean) => (lo ? (d < points[0].date ? points[0].date : d) : d > points[points.length - 1].date ? points[points.length - 1].date : d);
  return (
    <>
    <div className="chart" style={{ height: "clamp(240px, 32vw, 360px)" }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          {bands.filter(inRange).map((b) => (
            <ReferenceArea key={b.label + b.from} x1={clip(b.from, true)} x2={clip(b.to, false)} ifOverflow="hidden"
              fill={b.kind === "closure" ? "#99808a" : "#b08d57"} fillOpacity={b.kind === "closure" ? 0.12 : 0.22} stroke="none" />
          ))}
          <XAxis dataKey="date" tickFormatter={day} minTickGap={36} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tickFormatter={k} width={56} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v, name) => [k(Number(v)), name === "avg7" ? "7-day average" : "That day"]}
            labelFormatter={(d) => {
              const s = String(d);
              const on = bands.filter((b) => s >= b.from && s <= b.to).map((b) => b.label);
              return `${day(s)}${on.length ? ` · ${on.join(", ")}` : ""}`;
            }}
          />
          <Line dataKey="coin" stroke="#cdb6bd" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="avg7" stroke="#6d1a36" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <details className="chart-data">
      <summary>Show the numbers</summary>
      <div className="table-scroll">
        <table className="q2-table">
          <thead><tr><th scope="col">Day</th><th scope="col" className="num">Coin-in</th><th scope="col" className="num">7-day average</th><th scope="col">Events</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <th scope="row">{day(p.date)}</th>
                <td className="num">{k(p.coin)}</td>
                <td className="num">{p.avg7 == null ? "—" : k(p.avg7)}</td>
                <td>{bands.filter((b) => p.date >= b.from && p.date <= b.to).map((b) => b.label).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
    </>
  );
}

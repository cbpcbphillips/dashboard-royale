"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Series = { key: string; label: string; color: string; width?: number; dash?: string };
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Small multi-series daily line chart (one shared y axis; legend + hover tooltip). */
export function MultiLine({ data, series, fmt, summary }: { data: Record<string, number | string>[]; series: Series[]; fmt: "usd2" | "usd0"; summary: string }) {
  const f = (v: number) => (fmt === "usd2" ? `$${v.toFixed(2)}` : `$${Math.round(v)}`);
  return (
    <>
    <div className="chart" style={{ height: "clamp(240px, 28vw, 340px)" }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="d" tickFormatter={day} minTickGap={36} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tickFormatter={f} width={52} domain={["auto", "auto"]} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, name) => [f(Number(v)), series.find((s) => s.key === name)?.label ?? String(name)]} labelFormatter={(d) => day(String(d))} />
          <Legend formatter={(v) => series.find((s) => s.key === v)?.label ?? v} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} dot={s.width === 0 ? { r: 5, fill: s.color, stroke: s.color } : false} isAnimationActive={false} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <details className="chart-data">
      <summary>Show the numbers</summary>
      <div className="table-scroll" tabIndex={0}>
        <table className="q2-table">
          <thead><tr><th scope="col">Day</th>{series.map((s) => <th key={s.key} scope="col" className="num">{s.label}</th>)}</tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={String(r.d)}><th scope="row">{day(String(r.d))}</th>{series.map((s) => <td key={s.key} className="num">{Number.isFinite(Number(r[s.key])) ? f(Number(r[s.key])) : "—"}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
    </>
  );
}

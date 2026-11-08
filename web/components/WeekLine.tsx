/** Small server-rendered weekly line chart with one marked week (e.g. a policy change). */
export function WeekLine({ points, mark, fmt, label }: { points: { week: string; value: number; inPeriod: boolean }[]; mark?: string; fmt: (v: number) => string; label: string }) {
  const W = 520, H = 180, L = 44, R = 10, T = 12, B = 26;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals) * 1.08;
  const x = (i: number) => L + (i / Math.max(points.length - 1, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const mi = mark ? points.findIndex((p) => p.week >= mark) : -1;
  const ticks = [lo, (lo + hi) / 2, hi * 0.97];
  const months = points.map((p, i) => ({ i, m: p.week.slice(5, 7), first: i === 0 || points[i - 1].week.slice(5, 7) !== p.week.slice(5, 7) })).filter((p) => p.first);
  const NAMES: Record<string, string> = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun" };
  const first = points.findIndex((p) => p.inPeriod), last = points.length - 1 - [...points].reverse().findIndex((p) => p.inPeriod);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="weekline" role="img" aria-label={label}>
      {first >= 0 && <rect x={x(first) - 4} y={T} width={x(last) - x(first) + 8} height={H - T - B} fill="var(--accent-soft)" />}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="wl-axis">{fmt(t)}</text>
        </g>
      ))}
      {months.map((m) => <text key={m.i} x={x(m.i)} y={H - 8} className="wl-axis">{NAMES[m.m] ?? m.m}</text>)}
      {mi >= 0 && (
        <g>
          <line x1={x(mi)} x2={x(mi)} y1={T} y2={H - B} stroke="var(--brand)" strokeDasharray="4 3" />
          <text x={x(mi) + 5} y={T + 10} className="wl-mark">rate change</text>
        </g>
      )}
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth={2.5} />
      {points.map((p, i) => <circle key={p.week} cx={x(i)} cy={y(p.value)} r={2.5} fill="var(--brand)"><title>{`Week of ${p.week}: ${fmt(p.value)}`}</title></circle>)}
    </svg>
  );
}

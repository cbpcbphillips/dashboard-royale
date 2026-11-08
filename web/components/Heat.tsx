/** Small server-rendered heatmaps (one hue, light → dark), with the value on hover and a text summary for screen readers. */

const shade = (t: number) => {
  const a = Math.max(0, Math.min(1, t));
  // cream (#f6ece2) → oxblood (#6d1a36)
  const c0 = [246, 236, 226], c1 = [109, 26, 54];
  const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

export function HourWeekHeat({ cells, label, fmt }: { cells: { wd: string; hr: number; v: number }[]; label: string; fmt: (v: number) => string }) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const HOURS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24); // gaming day: 6 a.m. → 5 a.m.
  const vals = cells.map((c) => c.v).filter(Number.isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const get = (wd: string, hr: number) => cells.find((c) => c.wd === wd && c.hr === hr)?.v ?? NaN;
  const peak = cells.reduce((a, c) => (c.v > a.v ? c : a), cells[0]);
  const low = cells.reduce((a, c) => (c.v < a.v ? c : a), cells[0]);
  const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
  return (
    <div className="heat" role="img" aria-label={`${label}. Busiest: ${peak?.wd} ${h12(peak?.hr ?? 0)} (${fmt(peak?.v ?? 0)}); quietest: ${low?.wd} ${h12(low?.hr ?? 0)} (${fmt(low?.v ?? 0)}).`}>
      <div className="heat-grid" style={{ gridTemplateColumns: `34px repeat(24, minmax(0, 1fr))` }}>
        <span />
        {HOURS.map((h) => <span key={h} className="heat-hr">{h % 3 === 0 ? h12(h) : ""}</span>)}
        {DAYS.map((d) => (
          <div key={d} style={{ display: "contents" }}>
            <span className="heat-day">{d}</span>
            {HOURS.map((h) => {
              const v = get(d, h);
              return <span key={h} className="heat-cell" style={{ background: Number.isFinite(v) ? shade((v - lo) / (hi - lo || 1)) : "transparent" }} title={`${d} ${h12(h)}: ${Number.isFinite(v) ? fmt(v) : "—"}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend"><span>{fmt(lo)}</span><i style={{ background: `linear-gradient(90deg, ${shade(0)}, ${shade(1)})` }} /><span>{fmt(hi)}</span></div>
    </div>
  );
}

export function GridHeat({ rows, cols, get, fmt, label }: { rows: string[]; cols: string[]; get: (r: string, c: string) => number; fmt: (v: number) => string; label: string }) {
  const vals = rows.flatMap((r) => cols.map((c) => get(r, c))).filter(Number.isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div className="table-scroll" tabIndex={0}>
      <table className="q2-table grid-heat" aria-label={label}>
        <thead><tr><th scope="col"></th>{cols.map((c) => <th key={c} scope="col" className="num">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row">{r}</th>
              {cols.map((c) => {
                const v = get(r, c);
                const t = (v - lo) / (hi - lo || 1);
                return <td key={c} className="num" style={{ background: Number.isFinite(v) ? shade(t * 0.85) : undefined, color: t > 0.55 ? "#fff" : undefined }}>{Number.isFinite(v) ? fmt(v) : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

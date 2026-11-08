import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { DemandChart } from "@/components/DemandChart";
import { Ev } from "@/components/Ev";
import { FilterBar } from "@/components/FilterBar";
import { checkScope, isFullWindow, parseFilters, periodLabel } from "@/lib/period";
import { HourWeekHeat } from "@/components/Heat";
import { Q2_DIP, Q2_META, Q2_ZONES, computeQ2, hourWeek, q2Sentence } from "@/lib/q2";

export const metadata = { title: "Floor demand · The Gilded Ace" };

async function q2For(from: string, to: string, zone?: string) {
  "use cache";
  cacheLife("days");
  return computeQ2(from, to, zone);
}

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const signed = (x: number) => (Math.round(x * 100) === 0 ? "0%" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)}%`);
const pctR = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
const pctAbs = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${Math.abs(x * 100).toFixed(1)}%`);
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Q2Page(props: PageProps<"/demand">) {
  return (
    <>
      <div className="eyebrow">Floor demand</div>
      <h1 className="title">What changed in demand, and why?</h1>
      <p className="sub">How much was played each day, what lifted it (weekends and events), where on the floor players go, and what the Back Forty walkway closure did.</p>
      <Suspense fallback={<div className="skeleton" style={{ minHeight: 420 }} aria-busy="true" />}>
        <Q2Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Q2Content({ searchParams }: { searchParams: PageProps<"/demand">["searchParams"] }) {
  const f = checkScope(parseFilters(await searchParams), Q2_ZONES.map((z) => ({ id: z.zone_id })));
  const r = await q2For(f.from, f.to, f.zone);
  const label = periodLabel(f);
  const bands = [
    ...r.events.map((e) => ({ from: e.start_date, to: e.end_date, label: e.name, kind: "event" as const })),
    ...(r.closure ? [{ from: r.closure.from, to: r.closure.to, label: "Back Forty walkway closed", kind: "closure" as const }] : []),
  ];
  const head = Q2_DIP.find((d) => d.test.startsWith("Headline"));
  const traffic = Q2_DIP.find((d) => d.test.startsWith("Fewer people"));
  const inUse = Q2_DIP.find((d) => d.test.includes("machines in use"));
  const tests = Q2_DIP.filter((d) => d.verdict);
  const evIn = r.events.filter((e) => e.inPeriod).sort((a, b) => b.uplift - a.uplift);
  const maxLift = Math.max(...r.events.map((e) => e.uplift_hi - 1), 0.01);
  const floorRate = r.zones.reduce((a, z) => a + z.coinPerHour, 0) / Math.max(r.zones.length, 1);
  const wb = (area: string, period: string) => r.walkway.find((w) => w.area === area && w.period.startsWith(period));

  return (
    <>
      <FilterBar from={f.from} to={f.to} zone={f.zone} zones={Q2_ZONES.map((z) => ({ id: z.zone_id, name: z.name }))} banks={[]} note={`Data exported from Databricks · ${label}`} />
      {f.notes.map((n) => <div key={n} className="notice" role="status">{n}</div>)}
      <p className="answer">{q2Sentence(r, isFullWindow(f))} <Ev id="C10" /></p>

      <div className="kpis">
        <div className="card kpi"><div className="label">Coin-in per day</div><div className="value">{usd(r.coinPerDay)}</div><div className="foot">{r.scopeName}, {label}</div></div>
        <div className="card kpi"><div className="label">Weekends vs weekdays</div><div className="value">{Number.isFinite(r.weekendLift) ? signed(r.weekendLift) : "n/a"}</div><div className="foot">coin-in per day</div></div>
        <div className="card kpi"><div className="label">Machines in use</div><div className="value">{pct(r.occupancy, 1)}</div><div className="foot">share of open machine time someone was playing</div></div>
      </div>

      <section className="card block" aria-labelledby="daily-title">
        <h2 className="section" id="daily-title">Coin-in per day: {r.scopeName}</h2>
        <p className="cap">
          Dark line: 7-day average. <span className="swatch gold" /> event days · <span className="swatch grey" /> Back Forty walkway closed. Hover for the day.{" "}
          Across the whole half-year the floor got quieter after April because fewer people came in; see below. <Ev id="C23" />
        </p>
        <DemandChart points={r.days} bands={bands} summary={`Coin-in per day for ${r.scopeName}, ${label}: ${usd(r.coinPerDay)} a day on average. Event days and the Back Forty walkway closure are shaded; weekends run ${Number.isFinite(r.weekendLift) ? signed(r.weekendLift) : "n/a"} vs weekdays.`} />
      </section>

      <section className="card block" aria-labelledby="hw-title">
        <h2 className="section" id="hw-title">When players come: machines in use by hour of the week ({r.scopeName})</h2>
        <p className="cap">How to read it: each square is one hour of one weekday; darker = more of the machines in use. The gaming day runs 6 a.m. to 6 a.m., so late-night hours belong to the day before. Whole half-year.</p>
        <HourWeekHeat cells={hourWeek(f.zone)} label={`Share of machines in use by weekday and hour, ${r.scopeName}`} fmt={(v) => `${Math.round(v * 100)}%`} />
      </section>

      <div className="two-col">
        <section className="card" aria-labelledby="events-title">
          <h2 className="section" id="events-title">What events add <Ev id="C10" /></h2>
          <p className="cap">Coin-in on event days vs the same weekday in the same month without an event. Bar = best estimate; the thin line is the range of normal day-to-day swings.</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Event</th><th scope="col">Dates</th><th scope="col" className="num">Lift</th><th scope="col" className="bar-col">Range</th></tr></thead>
            <tbody>
              {r.events.slice().sort((a, b) => b.uplift - a.uplift).map((e) => (
                <tr key={e.name} className={e.inPeriod ? "" : "dim"}>
                  <th scope="row">{e.name}</th>
                  <td>{fmtDay(e.start_date)}{e.end_date !== e.start_date ? `–${fmtDay(e.end_date)}` : ""}</td>
                  <td className="num">{signed(e.uplift - 1)}</td>
                  <td className="bar-col">
                    <span className="lift">
                      <i className="lift-bar" style={{ width: `${(Math.max(e.uplift - 1, 0) / maxLift) * 100}%` }} />
                      <i className="lift-range" style={{ left: `${(Math.max(e.uplift_lo - 1, 0) / maxLift) * 100}%`, width: `${((e.uplift_hi - Math.max(e.uplift_lo, 1)) / maxLift) * 100}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ev">{evIn.length ? `${evIn.length} of ${r.events.length} events fall in this period; others are greyed.` : "No events fall in this period; all are greyed."} Lift is measured over the whole half-year.</p>
        </section>

        <section className="card" aria-labelledby="zones-title">
          <h2 className="section" id="zones-title">Where players go ({label})</h2>
          <p className="cap">Per open machine hour, so zones of different size compare fairly. Foot traffic = door/zone counter crossings per sensor hour (not unique people).</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Zone</th><th scope="col" className="num">Coin-in / hour</th><th scope="col" className="num">In use</th><th scope="col" className="num">Foot traffic</th></tr></thead>
            <tbody>
              {r.zones.map((z) => (
                <tr key={z.id} className={f.zone === z.id ? "sel" : ""}>
                  <th scope="row">{z.name}</th>
                  <td className="num">${Math.round(z.coinPerHour)} <span className="hint">{signed(z.coinPerHour / floorRate - 1)}</span></td>
                  <td className="num">{pct(z.occupancy)}</td>
                  <td className="num">{z.traffic == null ? "—" : z.traffic.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ev">Percent = vs the average zone. The High-Limit Room has high stakes but few players, so its coin-in per hour is high while its time in use is low.</p>
        </section>
      </div>

      <section className="card block" aria-labelledby="dip-title">
        <h2 className="section" id="dip-title">Why the floor got quieter after April <Ev id="C23" /></h2>
        <p className="answer">
          Fewer people came in. Comparing the same weekdays, coin-in per day fell {pctAbs(head?.change)} from January–April to May–June. Door-counter traffic fell{" "}
          {pctAbs(traffic?.change)} and machines in use {pctAbs(inUse?.change)}, while the amount played per busy hour barely moved. Every other explanation we tested is ruled out.
        </p>
        <div className="table-scroll" tabIndex={0}>
          <table className="q2-table">
            <thead><tr><th scope="col">Explanation tested</th><th scope="col" className="num">Change</th><th scope="col">Verdict</th><th scope="col">What we found</th></tr></thead>
            <tbody>
              {tests.map((d) => (
                <tr key={d.test}>
                  <th scope="row">{d.test}</th>
                  <td className="num">{pctR(d.change)}{d.lo != null && d.hi != null ? <span className="hint block-hint">{pctR(d.lo)} to {pctR(d.hi)}</span> : null}</td>
                  <td><span className={`cause cause-${d.verdict === "ruled out" ? "luck" : "location"}`}>{d.verdict}</span></td>
                  <td className="wrap-cell">{d.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ev">Whole half-year (not affected by the filters). Ranges: 95% of 2,000 resamples of days within weekday. Weather: NOAA GHCN-Daily, Las Vegas station USW00023169 (public domain), used only to explain, never as a forecast input. The data says who stopped coming, not why.</p>
      </section>

      <section className="card block" aria-labelledby="b40-title">
        <h2 className="section" id="b40-title">Back Forty and the walkway closure <Ev id="C11" /></h2>
        <p className="cap">
          The walkway from the Main Entrance to Back Forty was closed {r.closure ? `${fmtDay(r.closure.from)} – ${fmtDay(r.closure.to)}` : "Mar 3 – Apr 6"}. Back Forty was
          quiet before, during and after: it draws about a quarter of the foot traffic of the rest of the floor, and the closure cut it further.
        </p>
        <table className="q2-table">
          <thead><tr><th scope="col"></th><th scope="col" className="num">Before</th><th scope="col" className="num">During closure</th><th scope="col" className="num">After reopening</th></tr></thead>
          <tbody>
            {[["Back Forty", "Back Forty"], ["Rest of floor", "Rest of floor"]].map(([area, name]) => (
              <tr key={area}>
                <th scope="row">{name}: machines in use</th>
                {["before", "during", "after"].map((p) => <td key={p} className="num">{wb(area, p) ? pct(wb(area, p)!.occupancy, 1) : "—"}</td>)}
              </tr>
            ))}
            {[["Back Forty", "Back Forty"], ["Rest of floor", "Rest of floor"]].map(([area, name]) => (
              <tr key={area + "t"}>
                <th scope="row">{name}: foot traffic</th>
                {["before", "during", "after"].map((p) => <td key={p} className="num">{wb(area, p) ? wb(area, p)!.traffic.toFixed(0) : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ev">Whole half-year figures (not affected by the period filter). Month-to-month swings in what the floor <i>kept</i> are luck, not demand <Ev id="C08" />.</p>
      </section>

      <p className="ev">Source: {Q2_META.source}; generated {Q2_META.generated_at.replace("T", " ")}. Every number traces to a claim on <a href="/checks">Evidence</a>.</p>
    </>
  );
}

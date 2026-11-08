import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { Ev } from "@/components/Ev";
import { FilterBar } from "@/components/FilterBar";
import { parseFilters, periodLabel } from "@/lib/period";
import { Q3_BANKS, Q3_META, Q3_ZONES, computeQ3, q3Sentence } from "@/lib/q3";

export const metadata = { title: "Downtime & repairs · The Gilded Ace" };

async function q3For(from: string, to: string, zone?: string, bank?: string) {
  "use cache";
  cacheLife("days");
  return computeQ3(from, to, zone, bank);
}

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const hrs = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} h` : "—");

function staffNote(r: Awaited<ReturnType<typeof computeQ3>>): string {
  const [short, full] = r.staffing;
  const parts: string[] = [];
  if (!short.shifts) parts.push("No shift was short of slot techs in this period.");
  else {
    const similar = Math.abs(short.faultsPerShift - full.faultsPerShift) <= 0.25 * Math.max(full.faultsPerShift, 0.1);
    const longer = short.avgWait > full.avgWait * 1.25;
    parts.push(`Breakdowns per shift: ${short.faultsPerShift.toFixed(1)} on short shifts vs ${full.faultsPerShift.toFixed(1)} fully staffed${similar ? " (about the same)" : ""}`
      + (similar && longer ? ", so the longer waits come from fewer techs, not more faults." : "."));
  }
  const grave = r.byShift.find((s) => s.shift === "grave"), others = r.byShift.filter((s) => s.shift !== "grave" && Number.isFinite(s.avgWait));
  const otherWait = others.length ? others.reduce((a, s) => a + s.avgWait, 0) / others.length : NaN;
  if (grave && Number.isFinite(grave.avgWait) && Number.isFinite(otherWait) && grave.avgWait > otherWait * 1.5)
    parts.push(`The night (grave) shift waited ${grave.avgWait.toFixed(1)} h vs ${otherWait.toFixed(1)} h on day and swing.`);
  return parts.join(" ");
}

export default function Q3Page(props: PageProps<"/downtime">) {
  return (
    <>
      <div className="eyebrow">Downtime & repairs</div>
      <h1 className="title">How much play was lost to downtime, and when?</h1>
      <p className="sub">Every hour a machine was down, valued at what that zone normally plays at that hour of the week. Why it happened: how long repairs waited, staffing, and which makers break down most.</p>
      <Suspense fallback={<div className="skeleton" style={{ minHeight: 420 }} aria-busy="true" />}>
        <Q3Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Q3Content({ searchParams }: { searchParams: PageProps<"/downtime">["searchParams"] }) {
  const f = parseFilters(await searchParams);
  const r = await q3For(f.from, f.to, f.zone, f.bank);
  const label = periodLabel(f);
  const maxMonth = Math.max(...r.months.map((m) => m.lostTheo), 1);

  return (
    <>
      <FilterBar
        from={f.from} to={f.to} zone={f.zone} bank={f.bank}
        zones={Q3_ZONES.map((z) => ({ id: z.zone_id, name: z.name }))}
        banks={Q3_BANKS.map((b) => ({ id: b.bank_id, zoneId: b.zone_id })).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))}
        note={`Data exported from Databricks · ${label}`}
      />
      <p className="answer">{q3Sentence(r)} <Ev id="C12" /></p>

      <div className="kpis">
        <div className="card kpi"><div className="label">Expected earnings lost</div><div className="value">{usd(r.lostTheo)}</div><div className="foot">{usd(r.lostCoin)} of coin-in not played</div></div>
        <div className="card kpi"><div className="label">Machine-hours down</div><div className="value">{Math.round(r.downHours).toLocaleString("en-US")}</div><div className="foot">{r.faults} breakdowns</div></div>
        <div className="card kpi"><div className="label">Average wait for a tech</div><div className="value">{hrs(r.avgWait)}</div><div className="foot">from breakdown to repair starting</div></div>
      </div>

      <div className="two-col">
        <section className="card" aria-labelledby="month-title">
          <h2 className="section" id="month-title">When: expected earnings lost by month <Ev id="C12" /></h2>
          <p className="cap">{r.scopeName}, {label}. An upper bound: some players move to a neighbouring machine.</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Month</th><th scope="col" className="num">Lost</th><th scope="col" className="num">Hours down</th><th scope="col" className="bar-col"></th></tr></thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{m.month}</th>
                  <td className="num">{usd(m.lostTheo)}</td>
                  <td className="num">{Math.round(m.downHours).toLocaleString("en-US")}</td>
                  <td className="bar-col"><span className="lift"><i className="lift-bar" style={{ width: `${(m.lostTheo / maxMonth) * 100}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" aria-labelledby="staff-title">
          <h2 className="section" id="staff-title">Why: repairs wait when slot techs are short <Ev id="C05" /></h2>
          <p className="cap">All shifts in {label} (techs cover the whole floor). Wait = breakdown to repair starting.</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Shifts</th><th scope="col" className="num">Count</th><th scope="col" className="num">Breakdowns / shift</th><th scope="col" className="num">Average wait</th></tr></thead>
            <tbody>
              {r.staffing.map((s) => (
                <tr key={s.label}><th scope="row">{s.label}</th><td className="num">{s.shifts}</td><td className="num">{s.faultsPerShift.toFixed(1)}</td><td className="num">{hrs(s.avgWait)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="q2-table" style={{ marginTop: 14 }}>
            <thead><tr><th scope="col">Shift</th><th scope="col" className="num">Tech-shifts worked / planned</th><th scope="col" className="num">Average wait</th></tr></thead>
            <tbody>
              {r.byShift.map((s) => (
                <tr key={s.shift}><th scope="row">{s.shift[0].toUpperCase() + s.shift.slice(1)}</th><td className="num">{s.actual} / {s.planned}</td><td className="num">{hrs(s.avgWait)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="ev">{staffNote(r)}</p>
        </section>
      </div>

      <div className="two-col">
        <section className="card" aria-labelledby="maker-title">
          <h2 className="section" id="maker-title">Which makers break down most <Ev id="C06" /></h2>
          <p className="cap">Whole floor, {label}. Per 1,000 days on the floor, so makers with more machines compare fairly.</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Maker</th><th scope="col" className="num">Machines</th><th scope="col" className="num">Breakdowns per 1,000 days</th><th scope="col" className="num">Expected earnings lost</th></tr></thead>
            <tbody>
              {r.makers.map((m) => (
                <tr key={m.maker}><th scope="row">{m.maker}</th><td className="num">{m.machines}</td><td className="num">{m.faultsPer1000.toFixed(1)}</td><td className="num">{usd(m.lostTheo)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" aria-labelledby="top-title">
          <h2 className="section" id="top-title">Machines that lost the most ({r.scopeName})</h2>
          <p className="cap">Pick a zone or bank above to drill in.</p>
          <table className="q2-table">
            <thead><tr><th scope="col">Machine</th><th scope="col">Bank</th><th scope="col">Maker</th><th scope="col" className="num">Hours down</th><th scope="col" className="num">Lost</th></tr></thead>
            <tbody>
              {r.topMachines.map((m) => (
                <tr key={m.id}>
                  <th scope="row"><a href={`/machines?machine=${m.id}`}>{m.id}</a></th>
                  <td>{m.bank}</td><td>{m.maker}</td>
                  <td className="num">{m.downHours.toFixed(1)}</td><td className="num">{usd(m.lostTheo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.topMachines.length && <p className="ev">No downtime in this selection.</p>}
        </section>
      </div>

      <p className="ev">Source: {Q3_META.source}; generated {Q3_META.generated_at.replace("T", " ")}. Every number traces to a claim on <a href="/checks">Evidence</a>.</p>
    </>
  );
}

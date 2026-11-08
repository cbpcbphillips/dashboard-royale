/** "How it's built" (Databricks pipeline) and "Data checks" panels for the Evidence tab. Static facts, each traceable
 *  to a script or report in the repo (docs/evidence/parity_*.md, royale/*.py, sql/*). */

const STEPS: { title: string; where: string; body: string }[] = [
  { title: "Source files", where: "organizer release", body: "62 Parquet files, every one checked against the release manifest (SHA-256)." },
  { title: "Bronze", where: "Unity Catalog · royale.bronze", body: "Uploaded to a Unity Catalog Volume and loaded as 31 Delta tables, unchanged." },
  { title: "Silver", where: "royale.silver", body: "Active machine-days only: gaming day 6 a.m.–6 a.m., dollars not cents, location taken per day." },
  { title: "Gold", where: "royale.gold", body: "Every metric, test and plan table, built by the same SQL files on a Databricks SQL warehouse and on DuckDB locally." },
  { title: "Models", where: "MLflow · Unity Catalog", body: "MLflow experiment royale-tpah (frozen forecast, three simple guesses, leakage test); model registered as royale.gold.tpah_glm." },
  { title: "This dashboard", where: "Next.js on Vercel", body: "Gold tables exported from Databricks to small files the site reads; no live queries, so it's fast and holds no keys." },
];

export function BuiltOn({ parity }: { parity: string }) {
  return (
    <section className="card block" aria-labelledby="built-title">
      <h2 className="section" id="built-title">How it&apos;s built: Databricks from raw files to this page</h2>
      <p className="cap">Each step is a re-runnable script in the repo (<code>royale/</code>, <code>sql/</code>). {parity}</p>
      <ol className="pipeline">
        {STEPS.map((s, i) => (
          <li key={s.title} className="pipe-step">
            <span className="pipe-n" aria-hidden="true">{i + 1}</span>
            <b>{s.title}</b>
            <span className="pipe-where">{s.where}</span>
            <span className="pipe-body">{s.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const CHECKS: { what: string; how: string }[] = [
  { what: "Days a machine wasn't on the floor", how: "1,018 of 56,110 daily rows are before a machine was installed or after it was retired. Left out, not counted as zero sales: 55,092 machine-days remain." },
  { what: "Luck vs the machine", how: "Actual house win and expected house win (theo) are kept apart everywhere; luck is judged against each machine's own bets and game volatility." },
  { what: "Exposure and uptime", how: "Every rate is per open hour (or per day on the floor), so new, retired and broken machines are compared fairly." },
  { what: "Ratios", how: "Always the ratio of sums (total won ÷ total played), never an average of daily ratios." },
  { what: "Daylight saving", how: "March 8, 2025 had 23 hours; hours come from each day's scheduled seconds, not 24." },
  { what: "Gaming day", how: "Timestamps are converted to the 6 a.m.–6 a.m. gaming day before grouping." },
  { what: "Cents vs dollars", how: "All _cents columns are divided by 100 before they meet _usd columns." },
  { what: "Carded vs all play", how: "Machine pages count everyone; the Players and Comps pages see only loyalty-card play, 65.8% of coin-in, and say so." },
  { what: "Door counters", how: "153 offline sensor-hours are left out (missing, not zero); 98 partial hours count only their covered minutes. Counts are crossings, not people." },
  { what: "Machines move", how: "Each day uses the bank and zone the machine actually sat in that day." },
  { what: "Comps", how: "Comp cost is counted once (it is already inside cost of goods); face value is never treated as revenue." },
];

export function DataChecks() {
  return (
    <section className="card block" aria-labelledby="dq-title">
      <h2 className="section" id="dq-title">Data checks behind every number</h2>
      <p className="cap">The traps in this data, and how each one is handled before any number reaches a page.</p>
      <dl className="dq-list">
        {CHECKS.map((c) => (
          <div key={c.what}>
            <dt><span aria-hidden="true">✓</span> {c.what}</dt>
            <dd>{c.how}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import { Ev, MiniMd } from "@/components/Ev";
import { BuiltOn, DataChecks } from "@/components/BuiltOn";
import { Glossary } from "@/components/Glossary";
import { OpenOnHash } from "@/components/OpenOnHash";
import { MultiLine } from "@/components/MultiLine";
import { CLAIMS } from "@/lib/claims";
import { MODEL } from "@/lib/model";

export const metadata = { title: "Evidence · The Gilded Ace" };

// From docs/evidence/parity_*.md (royale/parity_check.py): DuckDB vs Databricks, column by column.
const PARITY = "Every table was rebuilt on both engines and compared column by column (counts, sums, distinct values, date ranges): bronze 31 of 31, silver 1 of 1, gold 36 of 36 match.";

const usd2 = (x: number) => `$${x.toFixed(2)}`;
const usd0 = (x: number) => `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const pctF = (x: number) => `${(x * 100).toFixed(1)}%`;
const ZONE: Record<string, string> = { "Z-B40": "Back Forty", "Z-ENT": "Main Entrance", "Z-PIT": "Center Pit" };
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Page() {
  const m = Object.fromEntries(MODEL.metrics.map((x) => [x.method, x]));
  const model = m.pred_model, persist = m.pred_persistence, zg = m.pred_zone_game;
  const rows = [model, m.pred_glm_only, zg, persist].filter(Boolean);
  const dayGain = 1 - model.mae_machine_day / Math.min(zg.mae_machine_day, persist.mae_machine_day);
  const wk = MODEL.weekday;
  const fw = MODEL.floor.metrics.find((x) => x.forecast === "weekday_avg")!;
  const fc = MODEL.floor.metrics.find((x) => x.forecast === "constant_mean")!;
  const nightShift = MODEL.floor.shifts.find((x) => x.shift === "grave");
  const ch = MODEL.challenger;
  const unp = MODEL.persistence.find((p) => p.group.startsWith("Unpopular"));
  const rest = MODEL.persistence.find((p) => p.group === "Everyone else");
  const leak = Math.max(...MODEL.metrics.map((x) => x.leakage_test_max_abs_change));
  const move = MODEL.moves.find((x) => x.from_zone !== x.to_zone);

  return (
    <>
      <div className="eyebrow">Evidence</div>
      <h1 className="title">How we know the numbers hold up</h1>
      <p className="sub">
        First, how the forecasting model was tested. Then every claim behind the dashboard: the query that produces it, what we ruled out, and what it can&apos;t
        tell you. Anyone can re-run a claim on the same data: <code>uv run python -m royale.claims C18</code> (add <code>--engine databricks</code> to run it on Databricks).
      </p>

      <section className="card block" aria-labelledby="model-title">
        <h2 className="section" id="model-title">The model test: learned on January–April, judged on May–June <Ev id="C14" /></h2>
        <p className="cap">
          The model predicts each machine&apos;s expected earnings per open hour from its spot, game, weekday, holidays and pre-announced events. It was fitted on
          January–April only and then asked to predict every machine-day in May–June, with no May–June data used. It is compared with three simple guesses a manager
          might use, including one that already knows the weekly rhythm.
        </p>
        <p className="answer">
          Day by day, the model misses by {usd2(model.mae_machine_day)} per open hour vs {usd2(persist.mae_machine_day)} for a flat &quot;same as before&quot;: {Math.round(dayGain * 100)}% closer. Most of
          that is the weekly rhythm: a guess that knows weekdays (&quot;same as before, by weekday&quot;) misses by {usd2(wk.mae_machine_day_weekday)}. The model still beats it, by a small but
          real margin ({usd2(-wk.day_diff_model_minus_weekday)} per machine-day; 95% range {usd2(-wk.day_diff_hi)} to {usd2(-wk.day_diff_lo)}), from holidays, events and the spot. Over a whole
          two months it ties the flat guess ({usd2(model.mae_machine_period)} vs {usd2(persist.mae_machine_period)}). A stronger challenger (gradient-boosted trees, same split, no leakage)
          misses by {usd2(ch.mae_machine_day_challenger)} a day: clearly better than the weekday guess (by {usd2(-ch.day_diff_vs_weekday)}, range {usd2(-ch.day_diff_vs_weekday_hi)} to{" "}
          {usd2(-ch.day_diff_vs_weekday_lo)}) and than our model day by day, but not over two months, so the simpler model stays. Machines earned {usd2(model.mean_actual_rate)} per open hour on average.
        </p>
        <div className="table-scroll" tabIndex={0}>
          <table className="q2-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" className="num">Typical miss per machine-day</th>
                <th scope="col" className="num">Typical miss over two months</th>
                <th scope="col" className="num">Moved or new machines (3)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.method} className={x.method === "pred_model" ? "sel" : ""}>
                  <th scope="row">{x.label.replace("Baseline: zone x game average", "Simple guess: same zone × game average").replace("Baseline: machine persistence", "Simple guess: same as its own Jan–Apr")}</th>
                  <td className="num">{usd2(x.mae_machine_day)}</td>
                  <td className="num">{usd2(x.mae_machine_period)}</td>
                  <td className="num">{usd2(x.mae_moved_or_new)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Challenger: gradient-boosted trees (LightGBM)</th>
                <td className="num">{usd2(ch.mae_machine_day_challenger)}</td>
                <td className="num">{usd2(ch.mae_machine_period_challenger)}</td>
                <td className="num">—</td>
              </tr>
              <tr>
                <th scope="row">Simple guess: same as its own Jan–Apr, by weekday</th>
                <td className="num">{usd2(wk.mae_machine_day_weekday)}</td>
                <td className="num">{usd2(wk.mae_machine_period_weekday)}</td>
                <td className="num">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ev">Typical miss = average absolute error in expected earnings per open hour, across {model.machines} machines and {model.machine_days.toLocaleString("en-US")} machine-days. Lower is better.</p>

        <h3 className="subhead" style={{ marginTop: 18 }}>Whole floor, May–June: actual vs predicted (per open hour)</h3>
        <MultiLine
          data={MODEL.daily}
          fmt="usd2"
          summary={`Whole-floor expected earnings per open hour, May 1 – June 30: actual vs the model and three simple guesses. The model and the weekday guess follow the weekly ups and downs; the flat guesses do not. Typical daily miss: model ${usd2(model.mae_machine_day)}, weekday guess ${usd2(wk.mae_machine_day_weekday)}, flat guess ${usd2(persist.mae_machine_day)}.`}
          series={[
            { key: "actual", label: "Actual", color: "#3a1021", width: 2.5 },
            { key: "model", label: "Model", color: "#6d1a36", width: 2, dash: "5 3" },
            { key: "weekday", label: "Same as Jan–Apr, by weekday", color: "#2a78d6", width: 1.5, dash: "2 3" },
            { key: "persistence", label: "Same as Jan–Apr", color: "#b08d57", width: 1.5 },
            { key: "zone_game", label: "Zone × game average", color: "#99808a", width: 1.5 },
          ]}
        />
        <ul className="checks-list">
          <li>
            <b>The decision it changed.</b> The general manager planned to replace the 10 lowest earners: $33,800 to lease replacements, or $220,000 to buy them. The model
            separates a machine from its spot, and a real move confirmed it (below). Of those 10, only M-1158 is a machine problem (a payout check); the rest earn little
            because of where they sit or how long they were on the floor. So the July plan funds one inspection and two promotion weekends instead of replacements. Signs for Back Forty were tested and dropped, because most of the play they would bring is taken from other zones.{" "}
            <Ev id="C15" /> <Ev id="C16" /> <Ev id="C09" />
          </li>
          {unp && rest && (
            <li>
              <b>The machine ranking holds up out of sample.</b> Ranked on January–April only, {unp.machines} machines were proven to get less play than identical
              machines nearby. In May–June all of them were still below their prediction ({Math.round(unp.still_below_in_may_jun * unp.machines)} of {unp.machines}), at{" "}
              {Math.round(unp.may_jun_play_vs_prediction * 100)}% of it vs {Math.round(rest.may_jun_play_vs_prediction * 1000) / 10}% for everyone else. <Ev id="C24" />
            </li>
          )}
          <li>
            <b>Two models, two jobs.</b> This forecasting model (tested here) supplies the location effect and the day-to-day forecast. The Machines page ranks machines
            with a separate leave-one-out comparison model: each machine against the others on the same days, checked month by month and recomputed three ways{" "}
            <Ev id="C17" /> <Ev id="C18" />.
          </li>
          <li><b>Every method over-predicts by about $1 per open hour.</b> The floor got about 5% quieter after April, which nothing known on April 30 could foresee <Ev id="C17" />. The model and the weekday guess follow the weekly rhythm; the flat guesses can&apos;t.</li>
          <li><b>No peeking.</b> Scrambling every May–June outcome changed no prediction (largest change {leak.toFixed(1)}), so nothing from the test months leaked into the model. Its settings were chosen on an inner January–March → April split.</li>
          {move && (
            <li>
              <b>A real move confirms the location effect.</b> {move.machine_id} moved from {ZONE[move.from_zone] ?? move.from_zone} to {ZONE[move.to_zone] ?? move.to_zone} on {fmtDay(move.move_date)}. A model fitted without that machine
              predicted its earnings per hour would rise {move.predicted_change.toFixed(2)}×; they rose {move.actual_change.toFixed(2)}× ({usd2(move.actual_before)} → {usd2(move.actual_after)}). <Ev id="C16" />
            </li>
          )}
          <li><b>The machine-ranking model is checked twice.</b> The Machines page&apos;s leave-one-out prediction is recomputed in plain SQL on DuckDB and Databricks and in a Python reference, and all give the same top 10 <Ev id="C18" />; short windows no longer raise false alarms <Ev id="C20" />.</li>
          <li><b>Honest limit.</b> Over a whole two months the model ties the simplest guess, and day by day its edge over a weekday-aware guess is small (about 2%); what it adds is holidays, events and, above all, separating a machine from its spot. On the 3 moved or new machines, &quot;same as before&quot; did slightly better (n = 3).</li>
        </ul>
        <p className="ev">Runs are logged in MLflow on Databricks (experiment <code>royale-tpah</code>; model run <code>{model.mlflow_run_id}</code>; weekday guess <code>{wk.mlflow_run_id}</code>; challenger <code>{ch.mlflow_run_id}</code>) and the model is registered in Unity Catalog as <code>royale.gold.tpah_glm</code>. Source: {MODEL.meta.source}.</p>
      </section>

      <section className="card block" aria-labelledby="floor-title">
        <h2 className="section" id="floor-title">The simple forecast the guide suggests, and the decisions it informs <Ev id="C31" /></h2>
        <p className="answer">
          Whole-floor coin-in per day, frozen at April 30: averaging January–April by weekday misses May–June by {usd0(fw.mae_usd_per_day)} a day ({pctF(fw.mape)}), against{" "}
          {usd0(fc.mae_usd_per_day)} ({pctF(fc.mape)}) for a constant daily mean: {Math.round((1 - fw.mae_usd_per_day / fc.mae_usd_per_day) * 100)}% closer (range of the difference{" "}
          {usd0(-fw.diff_hi)} to {usd0(-fw.diff_lo)}). It runs {usd0(fw.bias_usd_per_day)} a day high, the post-April slowdown no April forecast could know <Ev id="C23" />.
        </p>
        <MultiLine
          data={MODEL.floor.daily.filter((r) => r.part === "test").map((r) => ({ d: r.d, coin: r.coin ?? NaN, weekday_avg: r.weekday_avg ?? NaN, constant_mean: r.constant_mean ?? NaN }))}
          fmt="usd0"
          summary={`Whole-floor coin-in per day, May–June: actual vs the weekday-average forecast and the constant mean. Typical miss ${usd0(fw.mae_usd_per_day)} vs ${usd0(fc.mae_usd_per_day)} a day.`}
          series={[
            { key: "coin", label: "Actual", color: "#3a1021", width: 2.5 },
            { key: "weekday_avg", label: "Average by weekday", color: "#2a78d6", width: 2, dash: "5 3" },
            { key: "constant_mean", label: "Constant mean", color: "#b08d57", width: 1.5 },
          ]}
        />
        <ul className="checks-list">
          <li><b>Promotion decision.</b> Refit on January–June, the same forecast gives each July day&apos;s expected coin-in without a promotion: the yardstick the two promotion weekends are judged against on the July plan <Ev id="C25" />.</li>
          <li><b>Staffing decision.</b> Forecasting faults per shift the same way barely beats a flat average ({nightShift ? nightShift.fault_forecast_mae.toFixed(2) : "—"} vs {nightShift ? nightShift.fault_forecast_mae_flat.toFixed(2) : "—"} faults a shift), so breakdowns arrive close to at random. July&apos;s night shift (one tech) expects about {nightShift ? Math.round(nightShift.july_faults) : "—"} faults; an extra tech would cut their waits to the day shifts&apos; level and save about {nightShift ? usd0(nightShift.extra_tech_saves_usd) : "—"} of expected earnings, against a $11,520 cost. So the plan doesn&apos;t fund one.</li>
        </ul>
      </section>

      <Glossary />
      <BuiltOn parity={PARITY} />
      <DataChecks />

      <section className="block" aria-labelledby="ev-title">
        <h2 className="section" id="ev-title">Every claim ({CLAIMS.length})</h2>
        <p className="cap">Each claim backs a number in the dashboard. Open one to see how to check it, what we ruled out and its limits. Evidence tags on other pages open the right one.</p>
        <OpenOnHash />
        <ol className="claims">
          {CLAIMS.map((c) => (
            <li key={c.id} id={c.id} className="card claim">
              <details>
                <summary>
                  <span className="claim-head">
                    <span className="claim-id">{c.id}</span>
                    <span className="claim-used">Used in: {c.used_in}</span>
                  </span>
                  <span className="claim-text"><MiniMd text={c.claim} /></span>
                </summary>
                <dl className="claim-dl">
                  <div><dt>Check it</dt><dd><MiniMd text={c.query} /></dd></div>
                  <div><dt>Result</dt><dd><MiniMd text={c.result} /></dd></div>
                  <div><dt>Ruled out</dt><dd><MiniMd text={c.alternative} /></dd></div>
                  <div><dt>Limits</dt><dd><MiniMd text={c.limitation} /></dd></div>
                </dl>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

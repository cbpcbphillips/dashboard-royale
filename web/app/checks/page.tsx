import { Ev, MiniMd } from "@/components/Ev";
import { MultiLine } from "@/components/MultiLine";
import { CLAIMS } from "@/lib/claims";
import { MODEL } from "@/lib/model";

export const metadata = { title: "Evidence · The Gilded Ace" };

const usd2 = (x: number) => `$${x.toFixed(2)}`;
const ZONE: Record<string, string> = { "Z-B40": "Back Forty", "Z-ENT": "Main Entrance", "Z-PIT": "Center Pit" };
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Page() {
  const m = Object.fromEntries(MODEL.metrics.map((x) => [x.method, x]));
  const model = m.pred_model, persist = m.pred_persistence, zg = m.pred_zone_game;
  const rows = [model, m.pred_glm_only, zg, persist].filter(Boolean);
  const dayGain = 1 - model.mae_machine_day / Math.min(zg.mae_machine_day, persist.mae_machine_day);
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
          January–April only and then asked to predict every machine-day in May–June, with no May–June data used. It is compared with two simple guesses a manager
          might use.
        </p>
        <p className="answer">
          Day by day, the model misses by {usd2(model.mae_machine_day)} per open hour vs {usd2(persist.mae_machine_day)} for &quot;same as before&quot;: {Math.round(dayGain * 100)}% closer, because it
          knows weekdays, holidays and events. Over a whole two months it ties &quot;same as before&quot; ({usd2(model.mae_machine_period)} vs {usd2(persist.mae_machine_period)}). Machines
          earned {usd2(model.mean_actual_rate)} per open hour on average.
        </p>
        <div className="table-scroll">
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
            </tbody>
          </table>
        </div>
        <p className="ev">Typical miss = average absolute error in expected earnings per open hour, across {model.machines} machines and {model.machine_days.toLocaleString("en-US")} machine-days. Lower is better.</p>

        <h3 className="subhead" style={{ marginTop: 18 }}>Whole floor, May–June: actual vs predicted (per open hour)</h3>
        <MultiLine
          data={MODEL.daily}
          fmt="usd2"
          series={[
            { key: "actual", label: "Actual", color: "#3a1021", width: 2.5 },
            { key: "model", label: "Model", color: "#6d1a36", width: 2, dash: "5 3" },
            { key: "persistence", label: "Same as Jan–Apr", color: "#b08d57", width: 1.5 },
            { key: "zone_game", label: "Zone × game average", color: "#99808a", width: 1.5 },
          ]}
        />
        <ul className="checks-list">
          <li>
            <b>The decision it changed.</b> The general manager planned to replace the 10 lowest earners: $33,800 to lease replacements, or $220,000 to buy them. The model
            separates a machine from its spot, and a real move confirmed it (below). Of those 10, only M-1158 is a machine problem (a payout check); the rest earn little
            because of where they sit or how long they were on the floor. So the July plan funds one inspection and Back Forty signage instead of replacements.{" "}
            <Ev id="C15" /> <Ev id="C16" /> <Ev id="C09" />
          </li>
          <li>
            <b>Two models, two jobs.</b> This forecasting model (tested here) supplies the location effect and the day-to-day forecast. The Machines page ranks machines
            with a separate leave-one-out comparison model: each machine against the others on the same days, checked month by month and recomputed three ways{" "}
            <Ev id="C17" /> <Ev id="C18" />.
          </li>
          <li><b>Every method over-predicts by about $1 per open hour.</b> The floor got about 5% quieter after April, which nothing known on April 30 could foresee <Ev id="C17" />. The model follows the weekly rhythm; the simple guesses can&apos;t.</li>
          <li><b>No peeking.</b> Scrambling every May–June outcome changed no prediction (largest change {leak.toFixed(1)}), so nothing from the test months leaked into the model. Its settings were chosen on an inner January–March → April split.</li>
          {move && (
            <li>
              <b>A real move confirms the location effect.</b> {move.machine_id} moved from {ZONE[move.from_zone] ?? move.from_zone} to {ZONE[move.to_zone] ?? move.to_zone} on {fmtDay(move.move_date)}. A model fitted without that machine
              predicted its earnings per hour would rise {move.predicted_change.toFixed(2)}×; they rose {move.actual_change.toFixed(2)}× ({usd2(move.actual_before)} → {usd2(move.actual_after)}). <Ev id="C16" />
            </li>
          )}
          <li><b>The machine-ranking model is checked twice.</b> The Machines page&apos;s leave-one-out prediction is recomputed in plain SQL on DuckDB and Databricks and in a Python reference, and all give the same top 10 <Ev id="C18" />; short windows no longer raise false alarms <Ev id="C20" />.</li>
          <li><b>Honest limit.</b> Over a whole two months the model ties the simplest guess; it wins on day-to-day planning (staffing, promotion timing). On the 3 moved or new machines, &quot;same as before&quot; did slightly better (n = 3).</li>
        </ul>
        <p className="ev">Runs are logged in MLflow on Databricks (experiment <code>royale-tpah</code>; model run <code>{model.mlflow_run_id}</code>) and the model is registered in Unity Catalog as <code>royale.gold.tpah_glm</code>. Source: {MODEL.meta.source}.</p>
      </section>

      <section className="block" aria-labelledby="ev-title">
        <h2 className="section" id="ev-title">Every claim ({CLAIMS.length})</h2>
        <ol className="claims">
          {CLAIMS.map((c) => (
            <li key={c.id} id={c.id} className="card claim">
              <div className="claim-head">
                <span className="claim-id">{c.id}</span>
                <span className="claim-used">Used in: {c.used_in}</span>
              </div>
              <p className="claim-text"><MiniMd text={c.claim} /></p>
              <dl className="claim-dl">
                <div><dt>Check it</dt><dd><MiniMd text={c.query} /></dd></div>
                <div><dt>Result</dt><dd><MiniMd text={c.result} /></dd></div>
                <div><dt>Ruled out</dt><dd><MiniMd text={c.alternative} /></dd></div>
                <div><dt>Limits</dt><dd><MiniMd text={c.limitation} /></dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

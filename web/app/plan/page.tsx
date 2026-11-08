import { Ev } from "@/components/Ev";
import { Q6 } from "@/lib/q6";

export const metadata = { title: "July plan · The Gilded Ace" };

const usd = (x: number) => `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const short = (a: string) => a.replace(/A-/g, "").replace(/-/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ X(\d)/g, " ×$1");

const MEASURE: Record<string, string> = {
  "A-PROMO": "Event-day coin-in vs the same weekday without an event (the method behind the event-lift claim), plus the 7 days before and after to catch play that just moved.",
  "A-INSPECT": "The finding (paytable, meter, nothing). If fixed: M-1158's payout vs its game settings over the next 30 days, inside its normal luck band.",
  "A-WAYFINDING": "Back Forty vs the rest of the floor, 30 days before vs after: time in use, coin-in per hour and door-counter traffic (the walkway-closure method).",
};

const pctOf = (x: number) => `${Math.round(x * 100)}%`;
/** Break-even: the share of our best-estimate gain the action must deliver to pay for itself, in the action's own terms. */
function breakEven(a: { action: string; cost: number; benefit_mid: number }) {
  if (!(a.benefit_mid > 0)) return "Never pays back in July";
  const r = a.cost / a.benefit_mid;
  const plain =
    a.action === "A-PROMO" ? `a lift of about ${(7.5 * r).toFixed(1)}% on promotion days (Locals Week did +7.5%)`
    : a.action === "A-WAYFINDING" ? `about ${(5 * r).toFixed(1)}% more play in the zone`
    : a.action === "A-INSPECT" ? `a ${pctOf(r)} chance that a fault is found and fixed`
    : `${pctOf(r)} of the expected gain`;
  return `${pctOf(r)} of the best estimate: ${plain}`;
}

const WORDS = ["", "one", "two", "three"];
/** One funded action as plain words, e.g. "two promotion weekends (Jul 18–20 and Jul 25–27, $30,000)". */
function phrase(a: { action: string; qty: number; target: string; cost: number; name: string }) {
  const n = WORDS[a.qty] ?? String(a.qty);
  if (a.action === "A-PROMO") {
    const dates = a.target.replace(/^.*\((.*)\)$/, "$1").replace(/-/g, "–").replace(", ", " and ");
    return `${a.qty === 1 ? "one promotion weekend" : `${n} promotion weekends`} (${dates}, ${usd(a.cost)})`;
  }
  if (a.action === "A-INSPECT") return `an inspection of ${a.target} (${usd(a.cost)})`;
  if (a.action === "A-WAYFINDING") return `new signs for ${a.target} (${usd(a.cost)})`;
  return `${a.name.toLowerCase()} (${a.target}, ${usd(a.cost)})`;
}
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default function Q6Page() {
  const chosen = Q6.chosen[0];
  const chosenParts = Q6.meta.chosen.split(" + ").map((s) => { const [action, q] = s.split(" x"); return { action, qty: q ? Number(q) : 1 }; });
  const isChosen = (a: { action: string; qty: number }) => chosenParts.some((c) => c.action === a.action && c.qty === a.qty);
  const actions = [...Q6.actions].sort((a, b) => b.net_mid - a.net_mid);
  const picked = chosenParts.map((c) => Q6.actions.find((a) => a.action === c.action && a.qty === c.qty)!).filter(Boolean);
  const safe = Q6.safest[0];
  const max = Math.max(...actions.map((a) => Math.abs(a.net_high)), 1);
  const x = (v: number) => 50 + (v / max) * 50;

  return (
    <>
      <div className="eyebrow">July plan</div>
      <h1 className="title">What we&apos;d fund with $100,000 in July</h1>
      <p className="sub">
        Every action on the price list, costed with the catalog&apos;s formula and valued from our data: expected earnings gained over only the days left after
        each action&apos;s lead time. Then every allowed mix (up to 3 kinds of action, within $100k) is compared.
      </p>

      <p className="answer">
        Fund {list(picked.map(phrase))}: {usd(chosen.cost)} in total, expected to bring in {usd(chosen.net_mid)} more than it costs in July (somewhere between{" "}
        {usd(chosen.net_low)} and {usd(chosen.net_high)}). Keep the other {usd(Q6.meta.budget - chosen.cost)}: every other action either loses money in July or adds only a
        little. <Ev id="C22" /> <Ev id="C21" /> <Ev id="C10" /> <Ev id="C03" /> <Ev id="C11" />
      </p>

      <div className="kpis">
        <div className="card kpi feature"><div className="label">Spend</div><div className="value">{usd(chosen.cost)}</div><div className="foot">of {usd(Q6.meta.budget)}; {usd(Q6.meta.budget - chosen.cost)} held back</div></div>
        <div className="card kpi"><div className="label">Expected net gain in July</div><div className="value">{usd(chosen.net_mid)}</div><div className="foot">range {usd(chosen.net_low)} to {usd(chosen.net_high)}</div></div>
        <div className="card kpi"><div className="label">Out of {Q6.n_portfolios} allowed mixes</div><div className="value">#{chosen.rank_mid}</div><div className="foot">on the best estimate; #{chosen.rank_low} on the worst case</div></div>
      </div>

      <div className="notice">
        <b>Where the promotion value comes from:</b> only the casino&apos;s own past promotions (the Winter Slot Tournament, +17%, and Locals Appreciation Week, +7.5%),
        not city events like the Super Bowl <Ev id="C10" />. The best estimate uses Locals Week&apos;s smaller lift; the second weekend is untested, so it counts for 50–100% of the first.
        The inspection is all-or-nothing: if a fault is found it recovers M-1158&apos;s full leak, if not, $0. The best cases add up every high estimate at once, so read them as a ceiling, not a forecast.
      </div>

      <section className="card block" aria-labelledby="funded-title">
        <h2 className="section" id="funded-title">What we fund, and how we&apos;ll know it worked</h2>
        <div className="table-scroll">
          <table className="q2-table">
            <thead><tr><th scope="col">Action</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Expected gain</th><th scope="col" className="num">Range</th><th scope="col">Pays for itself at</th><th scope="col">How we&apos;ll measure it</th></tr></thead>
            <tbody>
              {picked.map((a) => (
                <tr key={a.action}>
                  <th scope="row">{short(a.action)}{a.qty > 1 ? ` ×${a.qty}` : ""}<span className="hint block-hint">{a.target}</span></th>
                  <td className="num">{usd(a.cost)}</td>
                  <td className="num">{usd(a.benefit_mid)}</td>
                  <td className="num">{usd(a.benefit_low)} – {usd(a.benefit_high)}</td>
                  <td className="wrap-cell">{breakEven(a)}</td>
                  <td className="wrap-cell">{MEASURE[a.action] ?? "—"}<span className="how">How we valued it: {a.how}.</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card block" aria-labelledby="all-title">
        <h2 className="section" id="all-title">Every action, costed for July <Ev id="C21" /></h2>
        <p className="cap">Net = expected gain − cost, for July 1–30. Bar = best estimate; thin line = low to high. Grey area = loses money. Under each action: how its gain was valued.</p>
        <div className="table-scroll">
          <table className="q2-table">
            <thead><tr><th scope="col">Action</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Days of benefit</th><th scope="col" className="num">Net (best estimate)</th><th scope="col" className="bar-col">Net: loss ← 0 → gain</th><th scope="col">Evidence</th></tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.action + a.qty} className={isChosen(a) ? "sel" : ""}>
                  <th scope="row">{short(a.action)}{a.qty > 1 ? ` ×${a.qty}` : ""}<span className="hint block-hint">{a.target}</span><span className="how">{a.how}</span></th>
                  <td className="num">{usd(a.cost)}</td>
                  <td className="num">{a.benefit_days}</td>
                  <td className="num">{usd(a.net_mid)}</td>
                  <td className="bar-col">
                    <span className="netbar">
                      <i className="netbar-neg" />
                      <i className="netbar-zero" />
                      <i className="netbar-range" style={{ left: `${x(a.net_low)}%`, width: `${x(a.net_high) - x(a.net_low)}%` }} />
                      <i className="netbar-mid" style={{ left: `${Math.min(x(a.net_mid), 50)}%`, width: `${Math.abs(x(a.net_mid) - 50)}%` }} data-neg={a.net_mid < 0 ? "1" : "0"} />
                    </span>
                  </td>
                  <td>{a.evidence.split(/,\s*/).map((id) => <Ev key={id} id={id} />)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ev">Costs follow the catalog formula: quantity × (one-off cost + daily cost × days left after lead time), plus machine downtime valued at expected earnings. Gains are expected earnings (luck removed). Scenario assumptions are listed in <code>royale/budget.py</code>.</p>
      </section>

      <section className="card block" aria-labelledby="mix-title">
        <h2 className="section" id="mix-title">The best mixes within $100k <Ev id="C22" /></h2>
        <p className="cap">All {Q6.n_portfolios} allowed mixes (up to 3 kinds of action; the two comp actions can&apos;t be combined) ranked by best-estimate net. Ours is highlighted.</p>
        <div className="table-scroll">
          <table className="q2-table">
            <thead><tr><th scope="col">#</th><th scope="col">Mix</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Net, best estimate</th><th scope="col" className="num">Net, worst case</th><th scope="col" className="num">Net, best case</th></tr></thead>
            <tbody>
              {Q6.portfolios.slice(0, 10).map((p) => (
                <tr key={p.actions} className={p.actions === Q6.meta.chosen ? "sel" : ""}>
                  <td>{p.rank_mid}</td>
                  <th scope="row">{p.actions.split(" + ").map(short).join(" + ")}</th>
                  <td className="num">{usd(p.cost)}</td>
                  <td className="num">{usd(p.net_mid)}</td>
                  <td className="num">{usd(p.net_low)}</td>
                  <td className="num">{usd(p.net_high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ev">
          <b>The tradeoff we chose.</b> The safest mix, {safe.actions === "A-PROMO" ? "one promotion weekend" : safe.actions.split(" + ").map(short).join(" + ")} alone, can&apos;t lose money (worst case {usd(safe.net_low)}) but expects only{" "}
          {usd(safe.net_mid)}. Ours expects {usd(chosen.net_mid)}, {(chosen.net_mid / safe.net_mid).toFixed(1)}× as much, and its worst case is a loss of {usd(-chosen.net_low)}: that happens
          only if every action lands at its low end at once (no fault found, signage adds nothing, both promotions at their weakest). We accept that small downside for the larger
          expected gain; the second promotion weekend, untested, is the main source of the risk.
        </p>
      </section>

      <p className="ev">Source: {Q6.meta.source}; generated {Q6.meta.generated_at.replace("T", " ")}.</p>
    </>
  );
}

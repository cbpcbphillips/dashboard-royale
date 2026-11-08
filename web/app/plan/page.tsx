import { Ev } from "@/components/Ev";
import { MultiLine } from "@/components/MultiLine";
import { MODEL } from "@/lib/model";
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
const usdM = (x: number) => `$${(x / 1e6).toFixed(2)}M`;
const F = Q6.facts;
const signsMidLift = (F.traffic_elasticity * F.b40_traffic_headroom) / 2;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
/** Pre-registered success line per funded action (written before July 1). */
function successIf(a: { action: string; cost: number; benefit_mid: number }) {
  const r = a.cost / a.benefit_mid;
  if (a.action === "A-PROMO")
    return `Promotion days beat the model's no-promotion forecast for those days (refit on Jan–Jun) by at least ${(7.5 * r).toFixed(1)}%. Over ${F.promo_days} days the forecast can detect a lift of ${pct1(F.detectable_lift)} or more, so the test can tell. Read out Jul 28.`;
  if (a.action === "A-INSPECT") return "A paytable or meter fault is found. After the fix, M-1158 keeps what its settings imply, inside its normal luck band, for 30 days. Read out Jul 2 (finding) and Aug 1.";
  if (a.action === "A-WAYFINDING")
    return `Back Forty's time in use rises at least ${(100 * signsMidLift * r).toFixed(1)}% relative to the rest of the floor (same before/after comparison as the walkway closure) over the 20 days after the signs go up. Read out Jul 31.`;
  return "—";
}
const NEXT: Record<string, [string, string, string]> = {
  "A-PROMO": ["Repeat in the autumn, on the same kind of weekend", "Run one more weekend before deciding", "Stop; keep the money"],
  "A-INSPECT": ["Fix it and watch M-1158's payout for 30 days", "Check the meter readings again", "Close the lead; its loss was luck"],
  "A-WAYFINDING": ["Keep the signs and run them alongside promotions, when the floor fills (Back Forty is an overflow zone)", "Extend the read-out to 40 days", "Take them down; the gap is the spot itself, and no game swap fixes it, so put the money into promotions"],
};
/** Break-even: the share of our best-estimate gain the action must deliver to pay for itself, in the action's own terms. */
function breakEven(a: { action: string; cost: number; benefit_mid: number }) {
  if (!(a.benefit_mid > 0)) return "Never pays back in July";
  const r = a.cost / a.benefit_mid;
  const plain =
    a.action === "A-PROMO" ? `a lift of about ${(7.5 * r).toFixed(1)}% on promotion days (Locals Week did +7.5%)`
    : a.action === "A-WAYFINDING" ? `about ${(100 * signsMidLift * r).toFixed(1)}% more play in Back Forty`
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
  const sens = picked.map((a) => ({
    label: `${short(a.action)}${a.qty > 1 ? ` ×${a.qty}` : ""}`,
    low: chosen.net_mid - (a.benefit_mid - a.benefit_low),
    high: chosen.net_mid + (a.benefit_high - a.benefit_mid),
  })).sort((p, q) => (q.high - q.low) - (p.high - p.low));
  const sMin = Math.min(0, ...sens.map((x) => x.low)), sMax = Math.max(...sens.map((x) => x.high));
  const sx = (v: number) => ((v - sMin) / (sMax - sMin || 1)) * 100;
  const july = MODEL.floor.daily.filter((r) => r.part === "july");
  const promoDays = july.filter((r) => r.promo);
  const julyRows = july.map((r) => ({ d: r.d, baseline: r.july_forecast ?? NaN, promo: r.promo ? (r.july_forecast ?? NaN) : NaN }));
  const max = Math.max(...actions.map((a) => Math.abs(a.net_high)), 1);
  const x = (v: number) => 50 + (v / max) * 50;

  return (
    <>
      <div className="eyebrow">July plan</div>
      <h1 className="title">What we&apos;d fund with $100,000 in July</h1>
      <p className="sub">
        We priced every action on the list with the catalog&apos;s formula. We valued each one as July profit, counting only the days after its lead time. The
        vendor&apos;s share and the comps that extra play earns are taken off. Then we compared every allowed mix of up to 3 kinds of action within $100k.
      </p>

      <p className="answer">
        Fund {list(picked.map(phrase))}: {usd(chosen.cost)} in total, expected to bring in {usd(chosen.net_mid)} more than it costs in July (somewhere between{" "}
        {usd(chosen.net_low)} and {usd(chosen.net_high)}). Keep the other {usd(Q6.meta.budget - chosen.cost)}: every other action either loses money in July or adds only a
        little. New signs for Back Forty didn&apos;t make the cut: most of the play they would bring is taken from other zones. <Ev id="C22" /> <Ev id="C21" /> <Ev id="C10" /> <Ev id="C03" /> <Ev id="C26" />
      </p>

      <div className="kpis">
        <div className="card kpi feature"><div className="label">Spend</div><div className="value">{usd(chosen.cost)}</div><div className="foot">of {usd(Q6.meta.budget)}; {usd(Q6.meta.budget - chosen.cost)} held back</div></div>
        <div className="card kpi"><div className="label">Expected profit in July, after costs</div><div className="value">{usd(chosen.net_mid)}</div><div className="foot">range {usd(chosen.net_low)} to {usd(chosen.net_high)}</div></div>
        <div className="card kpi"><div className="label">Out of {Q6.n_portfolios} allowed mixes</div><div className="value">#{chosen.rank_mid}</div><div className="foot">on the best estimate; #{chosen.rank_low} on the worst case</div></div>
      </div>

      <details className="notice">
        <summary><b>How we valued the gains</b> (promotions from the casino&apos;s own past promotions, signs from the walkway closure, all as profit)</summary>
        <b>Where the promotion value comes from:</b> only the casino&apos;s own past promotions (the Winter Slot Tournament, +17%, and Locals Appreciation Week, +7.5%),
        not city events like the Super Bowl <Ev id="C10" />. The best estimate uses Locals Week&apos;s smaller lift; the second weekend is untested, so it counts for 50–100% of the first.
        The signs&apos; effect comes from the walkway closure: Back Forty&apos;s play followed its foot traffic ({F.traffic_elasticity.toFixed(2)}× as much), and it never got back {pct1(F.b40_traffic_headroom)} of its
        traffic after reopening; the signs would win back none, half or all of that <Ev id="C11" />. But only {pct1(F.b40_new_play_mid)} of that play is new to the casino:
        while the walkway was closed, the rest of the floor picked up {pct1(F.b40_displaced_before)} of the hours Back Forty lost <Ev id="C26" />. That leaves the signs short of their {usd(7500)} cost, so we don&apos;t fund them. Gains are profit: {pct1(F.vendor_share_rate * F.revshare_frac_floor)} of extra floor earnings goes to
        vendors on revenue-share machines and {pct1(F.comp_reinv_after * F.carded_share)} to comps.
        The inspection is all-or-nothing: if a fault is found it recovers M-1158&apos;s full leak, if not, $0. The best cases add up every high estimate at once, so read them as a ceiling, not a forecast.
      </details>

      <section className="card block" aria-labelledby="funded-title">
        <h2 className="section" id="funded-title">What we fund, and how we&apos;ll know it worked</h2>
        <div className="table-scroll" tabIndex={0}>
          <table className="q2-table">
            <thead><tr><th scope="col">Action</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Expected profit</th><th scope="col" className="num">Range</th><th scope="col">Pays for itself at</th><th scope="col">Success if (written before July 1)</th><th scope="col">How we&apos;ll measure it</th></tr></thead>
            <tbody>
              {picked.map((a) => (
                <tr key={a.action}>
                  <th scope="row">{short(a.action)}{a.qty > 1 ? ` ×${a.qty}` : ""}<span className="hint block-hint">{a.target}</span></th>
                  <td className="num">{usd(a.cost)}</td>
                  <td className="num">{usd(a.benefit_mid)}</td>
                  <td className="num">{usd(a.benefit_low)} – {usd(a.benefit_high)}</td>
                  <td className="wrap-cell">{breakEven(a)}</td>
                  <td className="wrap-cell">{successIf(a)}</td>
                  <td className="wrap-cell">{MEASURE[a.action] ?? "—"}<span className="how">How we valued it: {a.how}.</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card block" aria-labelledby="july-title">
        <h2 className="section" id="july-title">July without promotions: the yardstick <Ev id="C31" /> <Ev id="C25" /></h2>
        <p className="cap">
          Expected coin-in per day in July with no promotion (the weekday forecast, refit on January–June). Promotion days ({promoDays.map((r) => r.d.slice(5)).join(", ")}) are judged
          against these numbers: {promoDays.slice(0, 3).map((r) => `${new Date(r.d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${usdM(r.july_forecast ?? 0)}`).join(", ")}.
        </p>
        <MultiLine
          data={julyRows}
          fmt="usd0"
          summary={`Forecast coin-in per day for July 1–30 without promotions; promotion days marked. Fridays and Saturdays are highest.`}
          series={[
            { key: "baseline", label: "Expected without a promotion", color: "#6d1a36", width: 2 },
            { key: "promo", label: "Promotion days (baseline)", color: "#b08d57", width: 0, dash: "0" },
          ]}
        />
      </section>

      <section className="card block" aria-labelledby="next-title">
        <h2 className="section" id="next-title">What we&apos;ll do with the result <Ev id="C25" /></h2>
        <p className="cap">Decided now, before the results are in, so July&apos;s numbers can&apos;t be read to fit.</p>
        <div className="table-scroll" tabIndex={0}>
          <table className="q2-table">
            <thead><tr><th scope="col">Action</th><th scope="col">It works</th><th scope="col">Too close to call</th><th scope="col">It doesn&apos;t</th></tr></thead>
            <tbody>
              {picked.map((a) => (
                <tr key={a.action}><th scope="row">{short(a.action)}{a.qty > 1 ? ` ×${a.qty}` : ""}</th>{(NEXT[a.action] ?? ["—", "—", "—"]).map((t) => <td key={t} className="wrap-cell">{t}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card block" aria-labelledby="all-title">
        <h2 className="section" id="all-title">Every action, costed for July <Ev id="C21" /></h2>
        <p className="cap">Net = expected gain − cost, for July 1–30. Bar = best estimate; thin line = low to high. Grey area = loses money. Under each action: how its gain was valued.</p>
        <div className="table-scroll" tabIndex={0}>
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

      <section className="card block" aria-labelledby="sens-title">
        <h2 className="section" id="sens-title">Which assumption moves the result most <Ev id="C21" /></h2>
        <p className="cap">How to read it: each bar is our expected July profit ({usd(chosen.net_mid)}) if one action lands at its low or its high estimate while the others stay at their best estimate. The longest bar is the assumption to watch.</p>
        <div className="sens">
          {sens.map((x) => (
            <div key={x.label} className="sens-row">
              <span className="sens-label">{x.label}</span>
              <span className="sens-track">
                <i className="sens-zero" style={{ left: `${sx(0)}%` }} />
                <i className="sens-base" style={{ left: `${sx(chosen.net_mid)}%` }} />
                <i className="sens-bar" style={{ left: `${sx(x.low)}%`, width: `${sx(x.high) - sx(x.low)}%` }} />
              </span>
              <span className="sens-vals">{usd(x.low)} to {usd(x.high)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card block" aria-labelledby="mix-title">
        <h2 className="section" id="mix-title">The best mixes within $100k <Ev id="C22" /></h2>
        <p className="cap">All {Q6.n_portfolios} allowed mixes (up to 3 kinds of action; the two comp actions can&apos;t be combined) ranked by best-estimate net. Ours is highlighted.</p>
        <div className="table-scroll" tabIndex={0}>
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
          <b>The tradeoff we chose.</b> Ours is #{chosen.rank_mid} on the best estimate, {usd(Q6.portfolios[0].net_mid - chosen.net_mid)} behind the top mix, but it is the
          only one of the top {chosen.rank_mid} that doesn&apos;t lose money even if everything lands at its low end (worst case {usd(chosen.net_low)}). The mixes above it add machine
          moves or a comp-price change, whose gains rest on assumed shares of new play or can lose money. The safest mix of all, {safe.actions === "A-PROMO" ? "one promotion weekend" : safe.actions.split(" + ").map(short).join(" + ")} alone,
          expects only {usd(safe.net_mid)}; ours expects {(chosen.net_mid / safe.net_mid).toFixed(1)}× as much. The untested second promotion weekend is the main source of risk.
        </p>
      </section>

      <p className="ev">Source: {Q6.meta.source}; generated {Q6.meta.generated_at.replace("T", " ")}.</p>
    </>
  );
}

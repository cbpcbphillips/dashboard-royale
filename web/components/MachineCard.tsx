import type { MachineResult } from "@/lib/q1";
import { Q6 } from "@/lib/q6";
import { Ev } from "./Ev";
import { LabelChip } from "./LabelChip";

const money = (x: number) => `${x < 0 ? "−" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
/** Profit view of the shortfall: lost play loses the vendor share (revenue-share machines) and the comps it would have earned;
 *  a payout loss is house money, so only the vendor share applies (same rates as the July plan, claim C21). */
function profitShort(m: MachineResult) {
  const F = Q6.facts, vendor = m.leaseClass === "leased_revenue_share" ? F.vendor_share_rate : 0;
  const payout = m.luckPHolm < 0.05 ? Math.max(-m.luck, 0) : 0;
  return m.playShort * (1 - vendor - F.comp_reinv_after * F.carded_share) + payout * (1 - vendor);
}
/** A gap vs prediction in words: positive = below, negative = above. */
const gap = (x: number, d = 1) => (x >= 0 ? `${pct(x, d)} below` : `${pct(-x, d)} above`);

/** Everything about one machine (D-074/D-075): labels with reasons, the four measures with ranks, and the math on request. */
/** Horizontal waterfall: start, signed steps, end. Each step is a bar from the running total. */
function Waterfall({ steps }: { steps: { label: string; v: number; total?: boolean }[] }) {
  const bars: (typeof steps[number] & { from: number; to: number })[] = [];
  for (let i = 0, run = 0; i < steps.length; i++) {
    const s = steps[i];
    const from = s.total ? 0 : run;
    const to = s.total ? s.v : run + s.v;
    if (!s.total || i === 0) run = to;
    bars.push({ ...s, from: Math.min(from, to), to: Math.max(from, to) });
  }
  const lo = Math.min(0, ...bars.map((b) => b.from)), hi = Math.max(...bars.map((b) => b.to));
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <div className="wf" role="img" aria-label={steps.map((s) => `${s.label}: ${money(s.v)}`).join("; ")}>
      {bars.map((b) => (
        <div key={b.label} className="wf-row">
          <span className="wf-label">{b.label}</span>
          <span className="wf-track"><i className={`wf-bar ${b.total ? "wf-total" : b.v >= 0 ? "wf-up" : "wf-down"}`} style={{ left: `${x(b.from)}%`, width: `${Math.max(0.6, x(b.to) - x(b.from))}%` }} /></span>
          <span className="wf-val">{b.total ? money(b.v) : `${b.v >= 0 ? "+" : "−"}${money(Math.abs(b.v))}`}</span>
        </div>
      ))}
    </div>
  );
}

export function MachineCard({ m, of, floor }: { m: MachineResult; of: number; floor: { tpah: number; occupancy: number; uptime: number } }) {
  const below = m.shrunkGap;
  const measures = [
    { label: "Expected win per open hour", value: `$${m.tpah.toFixed(2)}`, rank: m.ranks.tpah, note: `floor $${floor.tpah.toFixed(2)}` },
    { label: "Coin-in per open hour", value: `$${Math.round(m.cpah)}`, rank: m.ranks.cpah, note: "how much is played" },
    { label: "Uptime", value: pct(m.uptime, 1), rank: m.ranks.uptime, note: `floor ${pct(floor.uptime, 1)}` },
    { label: "Time occupied (of open time)", value: pct(m.occupancy, 1), rank: m.ranks.occupancy, note: `floor ${pct(floor.occupancy, 1)}` },
    { label: "Actual vs expected win", value: `${m.luck >= 0 ? "+" : "−"}$${Math.abs(Math.round(m.luck)).toLocaleString("en-US")}`, rank: m.ranks.luck, note: "luck (or payout)" },
  ];
  return (
    <article className="card mcard" aria-label={`Machine ${m.id}`}>
      <h3>
        {m.id} · {m.theme}
      </h3>
      <div className="meta">
        {m.zoneName} · bank {m.bankId} · {m.maker} · {m.days} days on the floor{m.retired ? " · retired" : ""}
      </div>

      <div className="mcard-head">
        <div>
          <div className="label">Short of prediction <Ev id="C18" /></div>
          <div className="big">{money(m.score)}</div>
          {m.luckPHolm < 0.05 && <div className="foot">{money(Math.max(-m.luck, 0))} payout loss {m.playShort >= 0 ? "+" : "−"} {money(Math.abs(m.playShort))} {m.playShort >= 0 ? "lost play" : "extra play"}</div>}
          <div className="foot" title="Lost play costs less than its expected earnings: the vendor takes 20% on revenue-share machines and the play would have earned comps">
            as profit: {money(profitShort(m))}{m.leaseClass === "leased_revenue_share" ? " (revenue-share machine)" : ""}
          </div>
        </div>
        <div>
          <div className="label">Play vs prediction</div>
          <div className="big" title={`Before adjusting: ${gap(m.rawGap)}; pulled toward 0 because machines rarely differ much once spot and game are known`}>
            {gap(below)}
          </div>
          <div className="foot">before adjusting: {gap(m.rawGap)}</div>
        </div>
      </div>

      <div className="subhead">Why it earned what it did</div>
      <Waterfall steps={[
        { label: "A typical machine, same open hours", v: floor.tpah * m.openHours, total: true },
        { label: "Its spot and game (the prediction)", v: m.expected - floor.tpah * m.openHours },
        { label: "The machine itself (more or less play)", v: m.theo - m.expected },
        { label: "Luck (or a payout fault)", v: m.houseWin - m.theo },
        { label: "What it actually kept", v: m.houseWin, total: true },
      ]} />

      <div className="subhead">The basics ({m.days} days on the floor in this period)</div>
      <table className="basics">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col" className="num">Total</th>
            <th scope="col" className="num">Per open hour</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Actual income <span className="hint">what it really kept (house win)</span></th>
            <td className="num">{money(m.houseWin)}</td>
            <td className="num">${(m.houseWin / m.openHours).toFixed(2)}</td>
          </tr>
          <tr>
            <th scope="row">Expected income <span className="hint">what its game settings say it should keep from the play it got</span></th>
            <td className="num">{money(m.theo)}</td>
            <td className="num">${m.tpah.toFixed(2)}</td>
          </tr>
          <tr>
            <th scope="row">Predicted for its spot <span className="hint">what similar machines nearby say it should keep</span></th>
            <td className="num">{money(m.expected)}</td>
            <td className="num">${(m.expected / m.openHours).toFixed(2)}</td>
          </tr>
          <tr>
            <th scope="row">Coin-in <span className="hint">total amount played</span></th>
            <td className="num">{money(m.coinIn)}</td>
            <td className="num">${Math.round(m.cpah)}</td>
          </tr>
          <tr>
            <th scope="row">Open hours <span className="hint">uptime: share of scheduled time it worked</span></th>
            <td className="num">{Math.round(m.openHours).toLocaleString("en-US")} h</td>
            <td className="num">{pct(m.uptime, 1)} uptime</td>
          </tr>
          <tr>
            <th scope="row">In use <span className="hint">hours someone was playing</span></th>
            <td className="num">{Math.round(m.occupiedHours).toLocaleString("en-US")} h</td>
            <td className="num">{pct(m.occupancy, 1)} of open time</td>
          </tr>
          <tr>
            <th scope="row">Breakdowns <span className="hint">fault tickets vs normal for its maker</span></th>
            <td className="num">{m.faults}</td>
            <td className="num">normal ≈ {m.faultsExpected.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>

      <div className="subhead">Why it&apos;s labelled this way <Ev id="C19" /></div>
      <ul className="reasons">
        {m.labels.map((l) => (
          <li key={l.key + l.detail}>
            <LabelChip k={l.key} text={l.text} />
            <span>{l.detail}</span>
          </li>
        ))}
      </ul>

      <div className="subhead">How it compares ({of} machines on the floor in this period; 1 = best)</div>
      <dl className="measures">
        {measures.map((x) => (
          <div key={x.label}>
            <dt>{x.label}</dt>
            <dd>
              <b>{x.value}</b> <span className="rank">#{x.rank} of {of}</span>
              <span className="note">{x.note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <details className="math">
        <summary>How we worked this out</summary>
        <ol>
          <li>
            <b>What it should earn here.</b> A model learned from the <i>other</i> machines (same game, same kind of spot, same days)
            predicts this machine should have kept {money(m.expected)} over these {m.days} days, adjusted for how the rest of the floor did on
            those same days (so a slow season doesn&apos;t count against it). <Ev id="C17" /> Its own play implies it kept{" "}
            {money(m.theo)} (luck removed): {pct(m.ratio, 1)} of the prediction.
          </li>
          <li>
            <b>Is the gap real?</b> (This test holds up out of sample: machines flagged on January–April were all still below prediction in May–June <Ev id="C24" />.) Week to week, play swings. Testing the gap against that swing gives z = {Number.isFinite(m.playZ) ? m.playZ.toFixed(2) : "n/a"}. With
            only a few weeks the swing itself is uncertain, so the test asks for stronger evidence (a t-test). After correcting for testing every machine at once, it
            is {m.playPHolm < 0.05 ? "proven" : "not proven"}.
          </li>
          <li>
            <b>How big, most likely?</b> Machines rarely differ much once spot and game are known, so the raw gap ({gap(m.rawGap)}) is pulled toward zero
            by how little its own data can be trusted (weight {m.weight.toFixed(2)}): best estimate {gap(below)}, {m.playShort >= 0 ? `about ${money(m.playShort)} of lost earnings` : `about ${money(-m.playShort)} more than predicted`}.
          </li>
          <li>
            <b>Luck or payout?</b> Actual minus expected win is {money(m.luck)}, which is z = {Number.isFinite(m.luckZ) ? m.luckZ.toFixed(2) : "n/a"} in units of
            normal luck for its bets and game. {m.luckPHolm < 0.05 ? "That is beyond chance, so the whole shortfall counts and it should be inspected." : "That is within chance, so it doesn't count against the machine."} <Ev id="C03" />
          </li>
          <li>
            <b>Breakdowns.</b> {m.faults} fault tickets vs about {m.faultsExpected.toFixed(1)} normal for its maker over the same days.
          </li>
          <li>
            <b>Its spot.</b> Its bank is played {Number.isFinite(m.bankRatio) ? pct(m.bankRatio) : "n/a"} as much as the floor average (occupancy).
          </li>
        </ol>
        <p className="ev">The checks behind these numbers are on the <a href="/checks">Evidence</a> tab.</p>
      </details>
    </article>
  );
}

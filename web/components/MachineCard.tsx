import type { MachineResult } from "@/lib/q1";
import { Ev } from "./Ev";
import { LabelChip } from "./LabelChip";

const money = (x: number) => `${x < 0 ? "−" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Everything about one machine (D-074/D-075): labels with reasons, the four measures with ranks, and the math on request. */
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
        </div>
        <div>
          <div className="label">Play vs prediction</div>
          <div className="big" title={`Raw gap ${pct(m.rawGap, 1)}; shrunk toward 0 because machines rarely differ much once spot and game are known`}>
            {below >= 0 ? `${pct(below, 1)} below` : `${pct(-below, 1)} above`}
          </div>
          <div className="foot">raw {pct(m.rawGap, 1)} (hover)</div>
        </div>
      </div>

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
            <b>Is the gap real?</b> Week to week, play swings. Testing the gap against that swing gives z = {Number.isFinite(m.playZ) ? m.playZ.toFixed(2) : "n/a"}. With
            only a few weeks the swing itself is uncertain, so the test asks for stronger evidence (a t-test). After correcting for testing every machine at once, it
            is {m.playPHolm < 0.05 ? "proven" : "not proven"}.
          </li>
          <li>
            <b>How big, most likely?</b> Machines rarely differ much once spot and game are known, so the raw gap ({pct(m.rawGap, 1)}) is pulled toward zero
            by how little its own data can be trusted (weight {m.weight.toFixed(2)}): best estimate {pct(below, 1)} below, about {money(m.playShort)}.
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

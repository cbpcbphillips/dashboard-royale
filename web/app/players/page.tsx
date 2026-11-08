import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { Ev } from "@/components/Ev";
import { FilterBar } from "@/components/FilterBar";
import { GroupFilter } from "@/components/GroupFilter";
import { parseFilters } from "@/lib/period";
import { Q4_DIMS, Q4_META, computeQ4, parseGroup, q4Sentence } from "@/lib/q4";

export const metadata = { title: "Player results · The Gilded Ace" };

async function q4For(from: string, to: string, dim: string, grp: string) {
  "use cache";
  cacheLife("days");
  return computeQ4(from, to, dim, grp);
}

const usd = (x: number) => `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const big = (x: number) => `${x < 0 ? "−" : ""}$${(Math.abs(x) / 1e6).toFixed(1)}M`;
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

export default function Q4Page(props: PageProps<"/players">) {
  return (
    <>
      <div className="eyebrow">Player results</div>
      <h1 className="title">What did tracked players wager, get back and net?</h1>
      <p className="sub">Players who use a loyalty card. Each player&apos;s months are added up first, then we count who finished ahead and how concentrated play is. Pick a guest group to drill in.</p>
      <Suspense fallback={<div className="skeleton" style={{ minHeight: 420 }} aria-busy="true" />}>
        <Q4Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Q4Content({ searchParams }: { searchParams: PageProps<"/players">["searchParams"] }) {
  const raw = await searchParams;
  const f = parseFilters(raw);
  const g = parseGroup(raw.group);
  const q = await q4For(f.from, f.to, g.dim, g.grp);
  const s = q.sel;
  const groupValue = g.dim === "All players" ? "" : `${g.dim}:${g.grp}`;

  // Lorenz-style curve: share of expected earnings held by the top x% of players (by play)
  const W = 320, H = 200, P = 28;
  const pts = [0, ...s.lorenz].map((y, i) => [P + (i / 20) * (W - P - 8), H - P - y * (H - P - 8)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const at10 = pts[2];

  return (
    <>
      <FilterBar from={f.from} to={f.to} zones={[]} banks={[]} note={`Tracked months: ${q.months.label}`}>
        <GroupFilter dims={Q4_DIMS} value={groupValue} />
      </FilterBar>
      <p className="answer">{q4Sentence(q)} <Ev id="C13" /></p>

      <div className="kpis">
        <div className="card kpi"><div className="label">Wagered</div><div className="value">{big(s.coin)}</div><div className="foot">{s.players.toLocaleString("en-US")} players · {usd(s.coin / s.players)} each</div></div>
        <div className="card kpi"><div className="label">Got back</div><div className="value">{big(s.payout)}</div><div className="foot">{pct(s.payout / s.coin, 1)} of what they wagered</div></div>
        <div className="card kpi"><div className="label">Net result for players</div><div className="value">{big(s.net)}</div><div className="foot">typical player {usd(s.median_net)}; {pct(s.ahead, 1)} finished ahead</div></div>
      </div>

      <div className="two-col">
        <section className="card" aria-labelledby="conc-title">
          <h2 className="section" id="conc-title">How concentrated play is <Ev id="C13" /></h2>
          <p className="cap">Players ranked by how much they played. The top 10% account for {pct(s.top10_theo)} of expected earnings{s.top10_loss != null ? ` and ${pct(s.top10_loss)} of net losses` : ""}; the top 1% for {pct(s.top1_theo)}, and only {pct(s.top1_ahead, 1)} of them finished ahead.</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="lorenz" role="img" aria-label={`Top 10% of players account for ${pct(s.top10_theo)} of expected earnings`}>
            <line x1={P} y1={H - P} x2={W - 8} y2={8} stroke="var(--line)" strokeDasharray="3 3" />
            <line x1={P} y1={H - P} x2={W - 8} y2={H - P} stroke="var(--line)" />
            <line x1={P} y1={H - P} x2={P} y2={8} stroke="var(--line)" />
            <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2.5} />
            <circle cx={at10[0]} cy={at10[1]} r={4} fill="var(--brand)" />
            <text x={at10[0] + 8} y={at10[1] + 4} className="lorenz-label">top 10% → {pct(s.top10_theo)}</text>
            <text x={P} y={H - 8} className="lorenz-axis">0%</text>
            <text x={W - 8} y={H - 8} className="lorenz-axis" textAnchor="end">100% of players</text>
            <text x={P + 4} y={14} className="lorenz-axis">100% of expected earnings</text>
          </svg>
          <p className="ev">Dashed line = everyone plays the same amount. The further the curve bows up, the more play comes from a few players. For protective use only (e.g. limits, check-ins), never to target heavy losers.</p>
        </section>

        <section className="card" aria-labelledby="luck-title">
          <h2 className="section" id="luck-title">Luck vs the house edge</h2>
          <p className="cap">What players lost splits into the built-in house edge (expected) and luck (the rest).</p>
          <table className="q2-table">
            <tbody>
              <tr><th scope="row">Expected loss (house edge on what they played)</th><td className="num">{usd(-s.theo)}</td></tr>
              <tr><th scope="row">Luck (better or worse than expected)</th><td className="num">{usd(s.luck)}</td></tr>
              <tr><th scope="row">Net result</th><td className="num"><b>{usd(s.net)}</b></td></tr>
              <tr><th scope="row">Visits per player</th><td className="num">{s.visits.toFixed(1)}</td></tr>
              <tr><th scope="row">Comps given (cost to the casino)</th><td className="num">{usd(s.comp)}</td></tr>
            </tbody>
          </table>
          <p className="ev">{Math.abs(s.luck) <= 0.05 * s.theo ? `Across these ${s.players.toLocaleString("en-US")} players luck nearly cancels out (${pct(Math.abs(s.luck) / s.theo, 1)} of the expected loss), so the net result is close to the house edge.` : `Luck moved this group’s result by ${pct(Math.abs(s.luck) / s.theo, 1)} of the expected loss; in a smaller group luck matters more.`} Most individuals still lose: the edge works on every bet ({pct(s.ahead, 1)} finished ahead).</p>
        </section>
      </div>

      <section className="card block" aria-labelledby="groups-title">
        <h2 className="section" id="groups-title">Guest groups ({q.months.label})</h2>
        <p className="cap">Click a group to drill in. Share = this group&apos;s part of all tracked expected earnings.</p>
        <div className="table-scroll">
          <table className="q2-table">
            <thead><tr><th scope="col">Group</th><th scope="col" className="num">Players</th><th scope="col" className="num">Finished ahead</th><th scope="col" className="num">Wagered each</th><th scope="col" className="num">Net each</th><th scope="col" className="num">Visits each</th><th scope="col" className="num">Share of earnings</th></tr></thead>
            {q.groups.map((gr) => (
              <tbody key={gr.dim}>
                <tr className="group-head"><th colSpan={7} scope="colgroup">{gr.dim}</th></tr>
                {gr.rows.map((x) => (
                  <tr key={x.grp} className={g.dim === x.dim && g.grp === x.grp ? "sel" : ""}>
                    <th scope="row"><a href={`/players?${new URLSearchParams({ ...(f.from !== "2025-01-01" ? { from: f.from } : {}), ...(f.to !== "2025-06-30" ? { to: f.to } : {}), group: `${x.dim}:${x.grp}` })}`}>{x.grp}</a></th>
                    <td className="num">{x.players.toLocaleString("en-US")}</td>
                    <td className="num">{pct(x.ahead, 1)}</td>
                    <td className="num">{usd(x.coin / x.players)}</td>
                    <td className="num">{usd(x.net / x.players)}</td>
                    <td className="num">{x.visits.toFixed(1)}</td>
                    <td className="num">{pct(x.share_theo)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="ev">Tracked (carded) play only: about two-thirds of all coin-in. Groups are by the tier a player started the year in. Periods snap to whole months because player results are monthly.</p>
      </section>

      <p className="ev">Source: {Q4_META.source}; generated {Q4_META.generated_at.replace("T", " ")}. Every number traces to a claim on <a href="/checks">Evidence</a>.</p>
    </>
  );
}

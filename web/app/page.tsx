import Link from "next/link";
import { Ev } from "@/components/Ev";
import { WINDOW } from "@/lib/period";
import { computeQ1 } from "@/lib/q1";
import { computeQ2 } from "@/lib/q2";
import { computeQ3 } from "@/lib/q3";
import { computeQ4 } from "@/lib/q4";
import { Q5_CHANGE } from "@/lib/q5";
import { Q6 } from "@/lib/q6";

export const metadata = { title: "Summary · The Gilded Ace" };

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const k = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1000).toLocaleString("en-US")}k`);
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Executive summary: one finding per area, every number computed from the same data as its page. */
export default function Summary() {
  const { from, to } = WINDOW;
  const q1 = computeQ1(from, to);
  const unpopular = q1.machines.filter((m) => m.labels.some((l) => l.key === "unpopular"));
  const paying = q1.machines.filter((m) => m.labels.some((l) => l.key === "paying"));
  const quiet = q1.machines.filter((m) => m.labels.some((l) => l.key === "quiet"));
  // how the headline holds up on a shorter window (the model-test months)
  const q1Late = computeQ1("2025-05-01", "2025-06-30");
  const lateUnpopular = q1Late.machines.filter((m) => m.labels.some((l) => l.key === "unpopular")).length;
  const q2 = computeQ2(from, to);
  const hi = q2.months.reduce((a, b) => (b.coinPerDay > a.coinPerDay ? b : a));
  const lo = q2.months.reduce((a, b) => (b.coinPerDay < a.coinPerDay ? b : a));
  const topEvent = [...q2.events].sort((a, b) => b.uplift - a.uplift)[0];
  const b40 = q2.walkway.find((w) => w.area === "Back Forty" && w.period.startsWith("before"));
  const rest = q2.walkway.find((w) => w.area === "Rest of floor" && w.period.startsWith("before"));
  const q3 = computeQ3(from, to);
  const [short, full] = q3.staffing;
  const worstMaker = q3.makers[0];
  const otherMakers = q3.makers.slice(1).reduce((a, m) => a + m.faultsPer1000, 0) / Math.max(q3.makers.length - 1, 1);
  const q4 = computeQ4(from, to, "All players", "All");
  const locals = q4.groups.find((g) => g.dim === "Home region")?.rows.find((r) => r.grp === "Local");
  const comps = Q5_CHANGE.find((c) => c.opening_tier.startsWith("All (actual"))!;
  const plan = Q6.chosen[0];
  const funded = Q6.meta.chosen.split(" + ").map((s) => { const [action, q] = s.split(" x"); return Q6.actions.find((a) => a.action === action && a.qty === (q ? Number(q) : 1))!; });

  const cards = [
    {
      href: "/machines", topic: "Machine performance", stat: `${unpopular.length}`, statLabel: "machines get clearly less play than identical ones nearby",
      headline: `Most low earners are in quiet spots, not bad machines. Separately, ${paying.length} machine (${paying[0]?.id ?? "M-1158"}) gets normal play but pays out too much to be luck: inspect it.`,
      detail: `${quiet.length} of ${q1.machines.length} machines sit in quiet areas (all of Back Forty and the High-Limit Room). The ${unpopular.length} are proven over the full six months; on May–June alone ${lateUnpopular === 0 ? "none can be proven" : `only ${lateUnpopular} can be proven`}, because two months of data is too little to separate a weak unit from normal swings. Replacing a machine never pays back within a month.`,
      ev: ["C19", "C03"],
    },
    {
      href: "/demand", topic: "Floor demand", stat: k(q2.coinPerDay), statLabel: "coin-in per day",
      headline: `Demand peaked in ${hi.month} and fell to its low in ${lo.month} (${pct(lo.coinPerDay / hi.coinPerDay - 1)}); weekends run ${pct(q2.weekendLift)} above weekdays and events add up to ${pct(topEvent.uplift - 1)}.`,
      detail: b40 && rest ? `Back Forty draws about a quarter of the foot traffic of the rest of the floor (${b40.traffic.toFixed(0)} vs ${rest.traffic.toFixed(0)} entries per sensor hour), and the walkway closure cut it further.` : "",
      ev: ["C10", "C11"],
    },
    {
      href: "/downtime", topic: "Downtime & repairs", stat: k(q3.lostTheo), statLabel: "expected earnings lost to downtime",
      headline: `Downtime is a small cost overall, but repairs waited ${short.avgWait.toFixed(1)} h on shifts short of slot techs vs ${full.avgWait.toFixed(1)} h when fully staffed.`,
      detail: `${worstMaker.maker} machines break down ${(worstMaker.faultsPer1000 / otherMakers).toFixed(1)}× as often as the other makers. ${q3.months.reduce((a, b) => (b.lostTheo > a.lostTheo ? b : a)).month} was the worst month for downtime.`,
      ev: ["C12", "C05", "C06"],
    },
    {
      href: "/players", topic: "Player results", stat: pct(q4.all.ahead), statLabel: "of tracked players finished ahead",
      headline: `Tracked players wagered ${k(q4.all.coin)} and got back ${pct(q4.all.payout / q4.all.coin, 1)}; the typical player lost ${usd(-q4.all.median_net)}.`,
      detail: `Play is concentrated: the top 10% of players account for ${pct(q4.all.top10_theo)} of expected earnings${locals ? `, and locals are ${pct(locals.players / q4.all.players)} of players but ${pct(locals.share_theo)} of earnings` : ""}.`,
      ev: ["C13"],
    },
    {
      href: "/comps", topic: "Comps & loyalty", stat: `+${Math.round((comps.reinvestment_after / comps.reinvestment_before - 1) * 100)}%`, statLabel: "comp cost per $ of expected earnings",
      headline: `From late April a comp costs about half as many points (${comps.weekly_points_per_comp_usd_before.toFixed(0)} → ${comps.weekly_points_per_comp_usd_after.toFixed(0)} per $), and comp cost rose ${pct(comps.reinvestment_after / comps.reinvestment_before - 1)}.`,
      detail: "Visits barely moved, so far the cheaper comps are a cost without a visible return. The rise is not a shift in which tiers play.",
      ev: ["C07"],
    },
    {
      href: "/plan", topic: "July plan", stat: usd(plan.cost), statLabel: `of $100,000; ${usd(Q6.meta.budget - plan.cost)} kept`,
      headline: `Fund ${funded.map((a) => (a.action === "A-PROMO" ? `${a.qty} promotion weekend${a.qty > 1 ? "s" : ""}` : a.action === "A-INSPECT" ? `an inspection of ${a.target}` : a.action === "A-WAYFINDING" ? `${a.target} signage` : a.name.toLowerCase())).join(", ")}: about ${k(plan.net_mid)} more than it costs in July.`,
      detail: `Best of ${Q6.n_portfolios} allowed mixes on the best estimate (range ${plan.net_low < 0 ? "−" : ""}${k(Math.abs(plan.net_low))} to ${k(plan.net_high)}). Each action has a measurement plan.`,
      ev: ["C10", "C03", "C11"],
    },
  ];

  return (
    <>
      <div className="eyebrow">The Gilded Ace · January – June 2025</div>
      <h1 className="title">The floor in six findings</h1>
      <p className="sub">
        The machines on the manager&apos;s bottom-10 list mostly sit in a quiet corner of the floor; they aren&apos;t broken. Here is what drives earnings, and what
        we&apos;d do with $100,000 in July. Every number links to its evidence, and <a href="/checks#model-title">how we tested the model</a> is on the Evidence tab.
      </p>
      <div className="summary-grid">
        {cards.map((c) => (
          <article key={c.href} className="card summary-card">
            <div className="summary-topic">{c.topic}</div>
            <div className="summary-stat">{c.stat}<span>{c.statLabel}</span></div>
            <p className="summary-headline">{c.headline}</p>
            <p className="summary-detail">{c.detail} {c.ev.map((e) => <Ev key={e} id={e} />)}</p>
            <Link className="summary-link" href={c.href}>See the details →</Link>
          </article>
        ))}
      </div>
      <p className="ev">All figures for January 1 – June 30, 2025, computed from the Databricks gold tables. Each page lets you change the period and drill in.</p>
    </>
  );
}

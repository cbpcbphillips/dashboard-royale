import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { Ev } from "@/components/Ev";
import { FilterBar } from "@/components/FilterBar";
import { GroupFilter } from "@/components/GroupFilter";
import { WeekLine } from "@/components/WeekLine";
import { parseFilters } from "@/lib/period";
import { CHANGE_WEEK, Q5_CHANGE, Q5_META, Q5_TIERS, computeQ5 } from "@/lib/q5";

export const metadata = { title: "Comps & loyalty · The Gilded Ace" };

async function q5For(from: string, to: string, tier?: string) {
  "use cache";
  cacheLife("days");
  return computeQ5(from, to, tier);
}

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—");
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Q5Page(props: PageProps<"/comps">) {
  return (
    <>
      <div className="eyebrow">Comps & loyalty</div>
      <h1 className="title">What do comps cost, and what changed?</h1>
      <p className="sub">Comps are free food, drinks and rooms that players buy with loyalty points. We track what they cost the casino per dollar of expected earnings from carded play, and how the points price of a comp changed.</p>
      <Suspense fallback={<div className="skeleton" style={{ minHeight: 420 }} aria-busy="true" />}>
        <Q5Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Q5Content({ searchParams }: { searchParams: PageProps<"/comps">["searchParams"] }) {
  const raw = await searchParams;
  const f = parseFilters(raw);
  const gv = Array.isArray(raw.group) ? raw.group[0] : raw.group;
  const tier = gv?.startsWith("Loyalty tier:") && Q5_TIERS.includes(gv.split(":")[1]) ? gv.split(":")[1] : undefined;
  const q = await q5For(f.from, f.to, tier);
  const all = Q5_CHANGE.find((c) => c.opening_tier.startsWith("All (actual"))!;
  const mix = Q5_CHANGE.find((c) => c.opening_tier.includes("re-weighted"))!;
  const tiers = Q5_CHANGE.filter((c) => !c.opening_tier.startsWith("All"));
  const rise = all.reinvestment_after / all.reinvestment_before - 1;

  return (
    <>
      <FilterBar from={f.from} to={f.to} zones={[]} banks={[]} note={`Months: ${q.months.label}`}>
        <GroupFilter dims={{ "Loyalty tier": Q5_TIERS }} value={tier ? `Loyalty tier:${tier}` : ""} />
      </FilterBar>
      <p className="answer">
        From the week of {fmtDay(CHANGE_WEEK)}, a comp cost about half as many points ({all.weekly_points_per_comp_usd_before.toFixed(1)} → {all.weekly_points_per_comp_usd_after.toFixed(1)} points per dollar of
        comp). Since then comps cost the casino {Math.round(rise * 100)}% more per dollar of expected earnings ({pct(all.reinvestment_before)} → {pct(all.reinvestment_after)}), mostly
        in the Base tier, while visits barely moved: so far the cheaper comps are a cost without a visible return. <Ev id="C07" />
      </p>

      <div className="kpis">
        <div className="card kpi"><div className="label">Comp cost to the casino</div><div className="value">{usd(q.cost)}</div><div className="foot">{q.tier}, {q.months.label} · face value to guests {usd(q.face)}</div></div>
        <div className="card kpi"><div className="label">Cost per $ of expected earnings</div><div className="value">{pct(q.reinvestment)}</div><div className="foot">carded play</div></div>
        <div className="card kpi"><div className="label">Points per $ of comp</div><div className="value">{Number.isFinite(q.pointsPerComp) ? q.pointsPerComp.toFixed(1) : "—"}</div><div className="foot">lower = comps are cheaper for players</div></div>
      </div>

      <div className="two-col">
        <section className="card" aria-labelledby="pts-title">
          <h2 className="section" id="pts-title">The points price of a comp, week by week <Ev id="C07" /></h2>
          <p className="cap">Points redeemed per dollar of comp face value, all players. Shaded = your period.</p>
          <WeekLine points={q.weeks.map((w) => ({ week: w.week, value: w.points, inPeriod: w.inPeriod }))} mark={CHANGE_WEEK} fmt={(v) => v.toFixed(0)} label="Points per comp dollar by week; drops from about 13 to 6 at the end of April" />
        </section>
        <section className="card" aria-labelledby="cost-title">
          <h2 className="section" id="cost-title">Comp cost per $ of expected earnings</h2>
          <p className="cap">All players, week by week. The cost share rose after the change.</p>
          <WeekLine points={q.weeks.map((w) => ({ week: w.week, value: w.reinvestment, inPeriod: w.inPeriod }))} mark={CHANGE_WEEK} fmt={(v) => `${(v * 100).toFixed(1)}%`} label="Comp cost per dollar of carded expected earnings by week" />
        </section>
      </div>

      <section className="card block" aria-labelledby="tier-title">
        <h2 className="section" id="tier-title">Before vs after, by loyalty tier <Ev id="C07" /></h2>
        <p className="cap">Jan–Mar vs June (April–May left out as the switch-over). If the rise came only from a shift in which tiers play, holding the tier mix fixed would remove it; it doesn&apos;t ({pct(mix.reinvestment_after)} re-weighted).</p>
        <div className="table-scroll">
          <table className="q2-table">
            <thead><tr><th scope="col">Tier</th><th scope="col" className="num">Cost per $ before</th><th scope="col" className="num">After</th><th scope="col" className="num">Comps per player-month</th><th scope="col" className="num">Visits per player-month</th></tr></thead>
            <tbody>
              {tiers.map((c) => (
                <tr key={c.opening_tier} className={tier === c.opening_tier ? "sel" : ""}>
                  <th scope="row">{c.opening_tier}</th>
                  <td className="num">{pct(c.reinvestment_before)}</td>
                  <td className="num">{pct(c.reinvestment_after)}</td>
                  <td className="num">{c.comps_per_player_month_before?.toFixed(2)} → {c.comps_per_player_month_after?.toFixed(2)}</td>
                  <td className="num">{c.visits_per_player_month_before?.toFixed(2)} → {c.visits_per_player_month_after?.toFixed(2)}</td>
                </tr>
              ))}
              <tr><th scope="row">All tiers</th><td className="num">{pct(all.reinvestment_before)}</td><td className="num">{pct(all.reinvestment_after)}</td><td className="num">—</td><td className="num">—</td></tr>
            </tbody>
          </table>
        </div>
        <p className="ev">Before/after only, with no comparison group, and two months of &quot;after&quot;. That is why a small, measured pilot is the sensible next step (see the July plan).</p>
      </section>

      <p className="ev">Source: {Q5_META.source}; generated {Q5_META.generated_at.replace("T", " ")}. Every number traces to a claim on <a href="/checks">Evidence</a>.</p>
    </>
  );
}

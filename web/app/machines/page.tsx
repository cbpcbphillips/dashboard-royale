import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { FloorMap, type MapMachine, type MapSlot } from "@/components/FloorMap";
import { Ev } from "@/components/Ev";
import { MachineCard } from "@/components/MachineCard";
import { Q1List } from "@/components/Q1List";
import { parseFilters, periodLabel } from "@/lib/period";
import { BANKS, META, SLOTS, ZONES, answerSentence, computeQ1 } from "@/lib/q1";

const PAGE_SIZE = 10;

export const metadata = { title: "Machine performance · The Gilded Ace" };

/** Cached per period: the whole floor's results (labels and tests use every machine, D-076). */
async function q1For(from: string, to: string) {
  "use cache";
  cacheLife("days");
  return computeQ1(from, to);
}

export default function Q1Page(props: PageProps<"/machines">) {
  return (
    <>
      <div className="eyebrow">Machine performance</div>
      <h1 className="title">Which machines are truly underperforming?</h1>
      <p className="sub">
        Each machine is compared with what it <i>should</i> earn per open hour, predicted from the other machines in the same kind of spot running
        the same game on the same days, after allowing for days on the floor, downtime and luck.
      </p>
      <Suspense fallback={<div className="skeleton" style={{ minHeight: 420 }} aria-busy="true" />}>
        <Q1Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Q1Content({ searchParams }: { searchParams: PageProps<"/machines">["searchParams"] }) {
  const raw = await searchParams;
  const f = parseFilters(raw);
  const requestedPage = Math.max(1, Math.floor(Number(Array.isArray(raw.page) ? raw.page[0] : raw.page)) || 1);
  const r = await q1For(f.from, f.to);

  const inScope = r.machines.filter((m) => (!f.zone || m.zoneId === f.zone) && (!f.bank || m.bankId === f.bank));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(inScope.length / PAGE_SIZE)));
  const pageRows = inScope.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = r.machines.find((m) => m.id === f.machine) ?? inScope[0];
  const sentence = answerSentence(r, inScope);
  const label = periodLabel(f);

  // floor map: which machine sits in each slot (its latest slot in the period)
  const slotMachine = new Map<number, string>();
  for (const m of r.machines) if (m.slot >= 0 && !m.retired) slotMachine.set(m.slot, m.id);
  const mapSlots: MapSlot[] = SLOTS.map((s, i) => ({ id: s.location_id, x: s.x_m, y: s.y_m, zone: s.zone_id, bank: s.bank_id, machine: slotMachine.get(i) }));
  const mapMachines: MapMachine[] = r.machines.map((m) => ({
    id: m.id,
    labels: m.labels.map((l) => l.text),
    earnVsExpected: -m.shrunkGap,
    earnVsFloor: m.tpah / r.floor.tpah - 1,
    coinVsFloor: m.cpah / r.floor.cpah - 1,
    luckZ: m.luckZ,
    occVsExpected: m.occVsBankMates - 1,
    occVsFloor: m.occupancy / r.floor.occupancy - 1,
    uptimeVsExpected: m.uptimeVsMaker,
    uptimeVsFloor: m.uptime - r.floor.uptime,
  }));
  const zoneLabels = ZONES.map((z) => ({ id: z.zone_id, name: z.name, ...zoneCentre(z.zone_id, mapSlots) }));

  return (
    <>
      <FilterBar
        from={f.from}
        to={f.to}
        zone={f.zone}
        bank={f.bank}
        zones={ZONES.map((z) => ({ id: z.zone_id, name: z.name }))}
        banks={BANKS.map((b) => ({ id: b.bank_id, zoneId: b.zone_id })).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))}
        note={`Data exported from Databricks · ${label}`}
      />
      {r.shortWindow && (
        <div className="notice warn" role="status">
          <b>Short window ({r.periodDays} days).</b> With less data, fewer differences can be proven and more machines show “Low sample size”. For a
          reliable ranking choose at least two months. <Ev id="C20" />
        </div>
      )}
      {sentence && <p className="answer">{sentence} <Ev id="C19" /></p>}

      <div className="layout">
        <section className="card area-ten" aria-labelledby="top-title">
          <h2 className="section" id="top-title">Biggest underperformers</h2>
          <p className="cap">
            Ranked by how far each falls short of its prediction for {label} (lost play, plus any payout loss proven beyond chance). Click a machine for
            details. <Ev id="C18" />
          </p>
          <Q1List
            rows={pageRows.map((m) => ({ id: m.id, rank: m.rank, short: m.score, labels: m.labels }))}
            total={inScope.length}
            page={page}
            pageSize={PAGE_SIZE}
            selected={selected?.id}
          />
        </section>

        <aside className="area-side" id="machine-card" aria-label="Machine details">
          {selected ? <MachineCard m={selected} of={r.machines.length} floor={r.floor} /> : <div className="card">Select a machine.</div>}
        </aside>

        <section className="card area-flag" aria-labelledby="map-title">
          <h2 className="section" id="map-title">Floor map</h2>
          <p className="cap">Every slot at its real position. Pick a measure and what to compare it with. Default: earnings vs its expected value, so quiet areas don't all turn red; true outliers do. <Ev id="C17" /></p>
          <FloorMap slots={mapSlots} machines={mapMachines} zones={zoneLabels} selected={selected?.id} />
        </section>
      </div>
      <p className="ev">
        Source: {META.source}; generated {META.generated_at.replace("T", " ")}. Labels are tested across all {r.machines.length} machines on the floor in
        this period, so filtering by zone or bank doesn&apos;t change them. Every number traces to a claim on <a href="/checks">Evidence</a>.
      </p>
    </>
  );
}

function zoneCentre(zoneId: string, slots: MapSlot[]) {
  const zs = slots.filter((s) => s.zone === zoneId);
  return { x: zs.reduce((a, s) => a + s.x, 0) / zs.length, y: Math.min(...zs.map((s) => s.y)) };
}

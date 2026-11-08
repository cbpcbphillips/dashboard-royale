import { connection } from "next/server";
import { computeQ1 } from "@/lib/q1";
import { parseFilters } from "@/lib/period";

/** GET /api/q1?from=&to= : the Q1 results as JSON (used to check the app against royale/q1_reference.py). */
export async function GET(req: Request) {
  await connection();
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseFilters(q);
  const r = computeQ1(f.from, f.to);
  return Response.json({
    from: r.from, to: r.to, counts: r.counts,
    machines: r.machines.map((m) => ({
      machine_id: m.id, rank: m.rank, score: m.score, play_short: m.playShort, shrunk_gap: m.shrunkGap,
      play_z: m.playZ, luck_z: m.luckZ, avail_p: m.availP, bank_ratio: m.bankRatio,
      labels: m.labels.map((l) => l.key),
    })),
  });
}

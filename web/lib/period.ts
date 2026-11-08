// URL state for every page: ?from=YYYY-MM-DD&to=YYYY-MM-DD&zone=Z-B40&bank=B-31&machine=M-1158

export const WINDOW = { from: "2025-01-01", to: "2025-06-30" } as const;

export const PRESETS: { id: string; label: string; from: string; to: string }[] = [
  { id: "full", label: "Jan 1 – Jun 30, 2025 (full)", from: "2025-01-01", to: "2025-06-30" },
  { id: "train", label: "Jan – Apr (model training)", from: "2025-01-01", to: "2025-04-30" },
  { id: "test", label: "May – Jun (model test)", from: "2025-05-01", to: "2025-06-30" },
  { id: "jan", label: "January", from: "2025-01-01", to: "2025-01-31" },
  { id: "feb", label: "February", from: "2025-02-01", to: "2025-02-28" },
  { id: "mar", label: "March", from: "2025-03-01", to: "2025-03-31" },
  { id: "apr", label: "April", from: "2025-04-01", to: "2025-04-30" },
  { id: "may", label: "May", from: "2025-05-01", to: "2025-05-31" },
  { id: "jun", label: "June", from: "2025-06-01", to: "2025-06-30" },
];

export type Filters = { from: string; to: string; zone?: string; bank?: string; machine?: string };
type Raw = Record<string, string | string[] | undefined>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Z]-[A-Z0-9]{1,6}$/; // zone Z-B40, bank B-31, machine M-1158

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function clampDate(v: string | undefined, fallback: string) {
  if (!v || !DATE.test(v)) return fallback;
  if (v < WINDOW.from) return WINDOW.from;
  if (v > WINDOW.to) return WINDOW.to;
  return v;
}

/** Validate and normalise query params; anything malformed falls back to the full window. */
export function parseFilters(raw: Raw): Filters {
  let from = clampDate(one(raw.from), WINDOW.from);
  let to = clampDate(one(raw.to), WINDOW.to);
  if (from > to) [from, to] = [to, from];
  const id = (v: string | undefined) => (v && ID.test(v) ? v : undefined);
  return { from, to, zone: id(one(raw.zone)), bank: id(one(raw.bank)), machine: id(one(raw.machine)) };
}

export function isFullWindow(f: Filters) {
  return f.from === WINDOW.from && f.to === WINDOW.to;
}

export function presetFor(f: Pick<Filters, "from" | "to">) {
  return PRESETS.find((p) => p.from === f.from && p.to === f.to)?.id ?? "custom";
}

export function periodLabel(f: Pick<Filters, "from" | "to">) {
  const p = PRESETS.find((x) => x.from === f.from && x.to === f.to);
  if (p) return p.label.replace(" (full)", "");
  const fmt = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(f.from)} – ${fmt(f.to)}, 2025`;
}

export function daysInPeriod(f: Pick<Filters, "from" | "to">) {
  return Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
}

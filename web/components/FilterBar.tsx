"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useTransition } from "react";
import { PRESETS, WINDOW, presetFor } from "@/lib/period";

type Props = {
  from: string;
  to: string;
  zone?: string;
  bank?: string;
  zones: { id: string; name: string }[];
  banks: { id: string; zoneId: string }[];
  note?: string;
  children?: ReactNode; // extra filters for this page (e.g. guest group)
};

/** Period, zone and bank filters. All state lives in the URL so every view is shareable. */
export function FilterBar({ from, to, zone, bank, zones, banks, note, children }: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const preset = presetFor({ from, to });

  function set(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (q.get("from") === WINDOW.from && q.get("to") === WINDOW.to) {
      q.delete("from");
      q.delete("to");
    }
    start(() => router.push(`${path}${q.size ? `?${q}` : ""}`, { scroll: false }));
  }

  const bankOptions = banks.filter((b) => !zone || b.zoneId === zone);

  return (
    <div className="filters" aria-busy={pending}>
      <label className="filter">
        Period
        <select
          value={preset}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) set({ from: p.from, to: p.to });
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {preset === "custom" && <option value="custom">Custom range</option>}
        </select>
      </label>
      <label className="filter">
        From
        <input type="date" min={WINDOW.from} max={WINDOW.to} value={from} onChange={(e) => e.target.value && set({ from: e.target.value })} />
      </label>
      <label className="filter">
        To
        <input type="date" min={WINDOW.from} max={WINDOW.to} value={to} onChange={(e) => e.target.value && set({ to: e.target.value })} />
      </label>
      {zones.length > 0 && (
      <label className="filter">
        Zone
        <select value={zone ?? ""} onChange={(e) => set({ zone: e.target.value || undefined, bank: undefined })}>
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      )}
      {banks.length > 0 && (
        <label className="filter">
          Bank
          <select value={bank ?? ""} onChange={(e) => set({ bank: e.target.value || undefined })}>
            <option value="">All banks</option>
            {bankOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id}
              </option>
            ))}
          </select>
        </label>
      )}
      {children}
      {pending && <span className="filter-note">Updating…</span>}
      {note && !pending && <span className="filter-note">{note}</span>}
    </div>
  );
}

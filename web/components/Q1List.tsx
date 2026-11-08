"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import type { LabelKey } from "@/lib/q1";
import { LabelChip } from "./LabelChip";

export type ListRow = { id: string; rank: number; short: number; labels: { key: LabelKey; text: string; detail: string }[] };

const money = (x: number) => (x >= 0 ? `$${Math.round(x).toLocaleString("en-US")}` : `$${Math.round(-x).toLocaleString("en-US")} above`);

/** Top underperformers, 10 per page. Clicking a row opens its card (?machine=, D-021/D-074). */
export function Q1List({ rows, total, page, pageSize, selected }: { rows: ListRow[]; total: number; page: number; pageSize: number; selected?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const clicked = useRef<string | null>(null);

  useEffect(() => {
    if (!pending && clicked.current && clicked.current === selected) {
      clicked.current = null;
      if (window.matchMedia("(max-width: 1099px)").matches) document.getElementById("machine-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pending, selected]);

  function go(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div aria-busy={pending}>
      <div className="table-wrap">
        <table className="data q1-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Machine</th>
              <th className="num">$ short of prediction</th>
              <th>Labels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                aria-selected={r.id === selected}
                tabIndex={0}
                onClick={() => { clicked.current = r.id; go({ machine: r.id }); }}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), (clicked.current = r.id), go({ machine: r.id }))}
              >
                <td className="num c-rank">{r.rank}</td>
                <td className="c-id"><b>{r.id}</b></td>
                <td className="num c-short">{money(r.short)}</td>
                <td className="c-labels">
                  {r.labels.map((l) => (
                    <LabelChip key={l.key + l.detail} k={l.key} text={l.text} title={l.detail} />
                  ))}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} className="why">No machines match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 > 1 ? String(page - 1) : undefined })}>‹ Previous 10</button>
        <span>
          {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 machines"}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>Next 10 ›</button>
      </div>
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Guest-group drill (loyalty tier, age band, home region), kept in the URL as ?group=Dimension:Group. */
export function GroupFilter({ dims, value }: { dims: Record<string, string[]>; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="filter" aria-busy={pending}>
      Guest group
      <select
        value={value}
        onChange={(e) => {
          const q = new URLSearchParams(params.toString());
          if (e.target.value) q.set("group", e.target.value);
          else q.delete("group");
          start(() => router.push(`${path}${q.size ? `?${q}` : ""}`, { scroll: false }));
        }}
      >
        <option value="">All tracked players</option>
        {Object.entries(dims).map(([dim, groups]) => (
          <optgroup key={dim} label={dim}>
            {groups.map((g) => (
              <option key={g} value={`${dim}:${g}`}>{g}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

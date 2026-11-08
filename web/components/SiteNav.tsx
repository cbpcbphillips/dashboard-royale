"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export const PAGES = [
  { href: "/", label: "Summary" },
  { href: "/machines", label: "Machines" },
  { href: "/demand", label: "Demand" },
  { href: "/downtime", label: "Downtime" },
  { href: "/players", label: "Players" },
  { href: "/comps", label: "Comps" },
  { href: "/plan", label: "July plan" },
  { href: "/findings", label: "More findings" },
  { href: "/checks", label: "Evidence" },
] as const;

function Links({ query }: { query: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Pages">
      {PAGES.map((p) => (
        <Link key={p.href} href={`${p.href}${query}`} aria-current={path === p.href ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** Carries the chosen period (from/to) to every tab, so a judge who changes the period keeps it while moving around. */
function WithPeriod() {
  const params = useSearchParams();
  const q = new URLSearchParams();
  for (const k of ["from", "to"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  return <Links query={q.size ? `?${q}` : ""} />;
}

export function SiteNav() {
  return (
    <Suspense fallback={<Links query="" />}>
      <WithPeriod />
    </Suspense>
  );
}

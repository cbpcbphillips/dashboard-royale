"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PAGES = [
  { href: "/", label: "Summary" },
  { href: "/machines", label: "Machines" },
  { href: "/demand", label: "Demand" },
  { href: "/downtime", label: "Downtime" },
  { href: "/players", label: "Players" },
  { href: "/comps", label: "Comps" },
  { href: "/plan", label: "July plan" },
  { href: "/checks", label: "Evidence" },
] as const;

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Pages">
      {PAGES.map((p) => (
        <Link key={p.href} href={p.href} aria-current={path === p.href ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

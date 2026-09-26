"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/rapoarte/activitate", label: "Activitate clienti" },
  { href: "/rapoarte/stoc", label: "Stoc" },
  { href: "/rapoarte/miscari", label: "Miscari stoc" },
  { href: "/rapoarte/performanta", label: "Performanta" },
];

export default function ReportTabs() {
  const pathname = usePathname();
  return (
    <nav className="report-tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "active" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

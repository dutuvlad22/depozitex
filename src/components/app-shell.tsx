"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV.find((n) => n.href === pathname) ?? NAV[0];

  return (
    <div className="shell">
      {/* SIDEBAR */}
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">DX</div>
          <div>
            <div className="brand-name">DepoziteX</div>
            <div className="brand-sub">Fulfillment WMS</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = n.href === pathname;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="depot-tag">Depozit Giurgiu · RO-BG</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <header className="topbar">
          <h1>{active.label}</h1>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

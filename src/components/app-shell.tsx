"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";

export default function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  function isNavActive(href: string) {
    return href === pathname || (href !== "/" && pathname.startsWith(`${href}/`));
  }

  const active = NAV.find((n) => isNavActive(n.href)) ?? NAV[0];

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      {/* SIDEBAR */}
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">DX</div>
          <div>
            <div className="brand-name">DepoziteX</div>
            <div className="brand-sub">Fulfillment EWA</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = isNavActive(n.href);
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
          <div className="user-row">
            <span className="user-email" title={email}>
              {email}
            </span>
            <button
              className="signout-btn"
              onClick={handleSignOut}
              disabled={signingOut}
              title="Deconectare"
            >
              <LogOut size={15} />
            </button>
          </div>
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

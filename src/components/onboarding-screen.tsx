"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = orgName.trim();
    if (!name) {
      setError("Scrie un nume de organizatie.");
      return;
    }

    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("create_organization", {
      org_name: name,
      org_slug: slugify(name),
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Reface layout-ul server: acum gaseste membership-ul si intra in aplicatie.
    router.refresh();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">DX</div>
          <div className="auth-name">DepoziteX</div>
        </div>

        <h2>Creeaza-ti organizatia</h2>
        <p className="sub">Prima data: dai un nume firmei tale. Devii automat owner.</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="orgName">Nume organizatie</label>
            <input
              id="orgName"
              type="text"
              required
              autoFocus
              placeholder="ex. Smart Last Mile"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Se creeaza..." : "Creeaza organizatia"}
          </button>
        </form>

        {error && <div className="auth-msg err">{error}</div>}

        <div className="auth-switch">
          <button type="button" className="auth-linklike" onClick={handleSignOut}>
            Deconectare
          </button>
        </div>
      </div>
    </div>
  );
}

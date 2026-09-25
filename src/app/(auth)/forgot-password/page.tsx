"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// Client separat, fara PKCE: cu PKCE linkul din email merge doar in browserul
// care a cerut resetarea. Emailul trimite spre /auth/confirm cu token_hash
// (vezi sablonul de pe server), care functioneaza in orice browser/dispozitiv.
function createRecoveryClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await createRecoveryClient().auth.resetPasswordForEmail(email);

    setLoading(false);
    if (error) {
      setError(
        error.status === 429
          ? "Prea multe incercari. Mai incearca peste cateva minute."
          : error.message
      );
      return;
    }
    // Acelasi mesaj indiferent daca emailul are cont (nu dezvaluim conturile existente).
    setSent(true);
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="auth-mark">DX</div>
        <div className="auth-name">DepoziteX</div>
      </div>

      <h2>Am uitat parola</h2>
      <p className="sub">Iti trimitem pe email un link pentru a seta o parola noua.</p>

      {sent ? (
        <div className="auth-msg ok">
          Daca exista un cont cu adresa {email}, ai primit un email cu linkul de resetare.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              placeholder="nume@exemplu.ro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Se trimite..." : "Trimite linkul"}
          </button>
        </form>
      )}

      {error && <div className="auth-msg err">{error}</div>}

      <div className="auth-switch">
        <Link href="/login">Inapoi la autentificare</Link>
      </div>
    </div>
  );
}

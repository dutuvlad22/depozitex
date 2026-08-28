"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Daca Supabase are confirmarea prin email activata, signUp nu
    // returneaza o sesiune -> userul trebuie sa-si confirme emailul
    // inainte sa se poata autentifica.
    if (!data.session) {
      setSuccess("Cont creat! Verifica emailul pentru a-l confirma, apoi autentifica-te.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="auth-mark">DX</div>
        <div className="auth-name">DepoziteX</div>
      </div>

      <h2>Creeaza cont</h2>
      <p className="sub">Inregistreaza-te ca sa incepi sa folosesti DepoziteX.</p>

      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="fullName">Nume complet</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Ion Popescu"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
        <div className="auth-field">
          <label htmlFor="password">Parola</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="minim 6 caractere"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "Se creeaza contul..." : "Creeaza cont"}
        </button>
      </form>

      {error && <div className="auth-msg err">{error}</div>}
      {success && <div className="auth-msg ok">{success}</div>}

      <div className="auth-switch">
        Ai deja cont? <Link href="/login">Autentifica-te</Link>
      </div>
    </div>
  );
}

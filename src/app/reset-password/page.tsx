"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// In afara grupului (auth): userul ajunge aici deja logat, prin linkul din email
// (/auth/callback), iar layout-ul (auth) l-ar redirectiona pe /.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Parolele nu coincid.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(
        error.name === "AuthSessionMissingError"
          ? "Sesiunea a expirat. Cere un link nou din pagina „Am uitat parola”."
          : error.code === "same_password"
          ? "Parola noua trebuie sa fie diferita de cea veche."
          : error.code === "weak_password"
            ? "Parola e prea slaba (minim 6 caractere)."
            : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">DX</div>
          <div className="auth-name">DepoziteX</div>
        </div>

        <h2>Parola noua</h2>
        <p className="sub">Alege parola noua pentru contul tau.</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="password">Parola noua</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirm">Confirma parola</label>
            <input
              id="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Se salveaza..." : "Salveaza parola"}
          </button>
        </form>

        {error && <div className="auth-msg err">{error}</div>}
      </div>
    </div>
  );
}

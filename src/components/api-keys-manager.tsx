"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  clients: { name: string } | null;
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default function ApiKeysManager({
  clients,
  keys,
}: {
  clients: { id: string; name: string }[];
  keys: ApiKeyRow[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; client: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error } = await createClient().rpc("create_client_api_key", {
      p_client_id: clientId,
      p_name: name,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewKey({ key: data as string, client: clients.find((c) => c.id === clientId)?.name ?? "" });
    setCopied(false);
    setName("");
    router.refresh();
  }

  async function handleRevoke(id: string) {
    setError(null);
    const { error } = await createClient().rpc("revoke_client_api_key", { p_key_id: id });
    setConfirmRevokeId(null);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <KeyRound size={16} /> Cheie noua
        </div>
        {clients.length === 0 ? (
          <div className="empty">Adauga intai un client, apoi genereaza-i o cheie API.</div>
        ) : (
          <form className="form-row" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="key-client">Client</label>
              <select id="key-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="key-name">Nume cheie</label>
              <input
                id="key-name"
                placeholder="ex. Magazin Shopify"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Se genereaza..." : "Genereaza cheie"}
            </button>
          </form>
        )}

        {newKey && (
          <div className="new-key">
            <div className="strong">Cheia pentru {newKey.client}</div>
            <div className="new-key-row">
              <code>{newKey.key}</code>
              <button className="btn ghost small" type="button" onClick={copyKey}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiata" : "Copiaza"}
              </button>
            </div>
            <div className="small">
              Copiaz-o acum si trimite-o clientului pe un canal sigur. Din motive de securitate nu o
              mai poti vedea dupa ce parasesti pagina; daca se pierde, genereaza una noua.
            </div>
          </div>
        )}

        {error && <div className="auth-msg err">{error}</div>}
      </section>

      <div className="table-wrap report-table">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Nume</th>
              <th>Cheie</th>
              <th>Creata</th>
              <th>Ultima folosire</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Nicio cheie API inca.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="strong">{k.clients?.name ?? "—"}</td>
                <td>{k.name}</td>
                <td className="mono small">{k.key_prefix}…</td>
                <td className="muted small">{fmt(k.created_at)}</td>
                <td className="muted small">{fmt(k.last_used_at)}</td>
                <td>
                  {k.revoked_at ? (
                    <span className="pill epuizat">Revocata</span>
                  ) : (
                    <span className="pill ok">Activa</span>
                  )}
                </td>
                <td className="actions">
                  {!k.revoked_at &&
                    (confirmRevokeId === k.id ? (
                      <span className="confirm-delete">
                        <button className="btn danger small" onClick={() => handleRevoke(k.id)}>
                          Revoca
                        </button>
                        <button className="btn ghost small" onClick={() => setConfirmRevokeId(null)}>
                          Anuleaza
                        </button>
                      </span>
                    ) : (
                      <button className="btn ghost small" onClick={() => setConfirmRevokeId(k.id)}>
                        Revoca
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

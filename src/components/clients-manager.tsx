"use client";

import { useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ClientRow = {
  id: string;
  name: string;
  contact: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ClientsManager({
  organizationId,
  initialClients,
  isAdmin,
}: {
  organizationId: string;
  initialClients: ClientRow[];
  isAdmin: boolean;
}) {
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Scrie un nume de client.");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        organization_id: organizationId,
        name: trimmedName,
        contact: contact.trim() || null,
      })
      .select("id, name, contact, created_at")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setClients((prev) => [data as ClientRow, ...prev]);
    setName("");
    setContact("");
  }

  async function handleDelete(client: ClientRow) {
    setError(null);
    setDeletingId(client.id);

    const supabase = createClient();
    const { error } = await supabase.from("clients").delete().eq("id", client.id);

    setDeletingId(null);
    setConfirmId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setClients((prev) => prev.filter((c) => c.id !== client.id));
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <UserPlus size={16} /> Adauga client
        </div>
        <form className="form-row" onSubmit={handleAdd}>
          <div className="field">
            <label htmlFor="clientName">Nume</label>
            <input
              id="clientName"
              type="text"
              placeholder="ex. Bebe si Co"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="clientContact">Contact</label>
            <input
              id="clientContact"
              type="text"
              placeholder="telefon sau email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Se adauga..." : "Adauga client"}
          </button>
        </form>
        {error && <div className="auth-msg err">{error}</div>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nume</th>
              <th>Contact</th>
              <th>Adaugat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.name}</td>
                <td className="muted">{c.contact || "—"}</td>
                <td className="muted small">{formatDate(c.created_at)}</td>
                <td className="actions">
                  {!isAdmin ? null : confirmId === c.id ? (
                    <span className="confirm-delete">
                      <span className="small muted">Sigur?</span>
                      <button
                        className="btn small ghost"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === c.id}
                      >
                        Nu
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                      >
                        {deletingId === c.id ? "..." : "Da, sterge"}
                      </button>
                    </span>
                  ) : (
                    <button
                      className="icon-btn"
                      onClick={() => setConfirmId(c.id)}
                      title="Sterge clientul"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  <Users size={18} style={{ marginBottom: 6 }} />
                  <br />
                  Niciun client inca. Adauga primul mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

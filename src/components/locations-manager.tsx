"use client";

import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type LocationRow = {
  id: string;
  code: string;
  zone: string | null;
  created_at: string;
};

export default function LocationsManager({
  organizationId,
  warehouseId,
  initialLocations,
  isAdmin,
}: {
  organizationId: string;
  warehouseId: string;
  initialLocations: LocationRow[];
  isAdmin: boolean;
}) {
  const [locations, setLocations] = useState<LocationRow[]>(initialLocations);
  const [code, setCode] = useState("");
  const [zone, setZone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Scrie un cod de locatie (ex. A-01-02).");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("locations")
      .insert({
        organization_id: organizationId,
        warehouse_id: warehouseId,
        code: trimmedCode,
        zone: zone.trim() || null,
      })
      .select("id, code, zone, created_at")
      .single();

    setSaving(false);

    if (error) {
      setError(
        error.code === "23505"
          ? `Codul "${trimmedCode}" exista deja in acest depozit.`
          : error.message
      );
      return;
    }

    setLocations((prev) =>
      [...prev, data as LocationRow].sort((a, b) => a.code.localeCompare(b.code))
    );
    setCode("");
    setZone("");
  }

  async function handleDelete(location: LocationRow) {
    setError(null);
    setDeletingId(location.id);

    const supabase = createClient();
    const { error } = await supabase.from("locations").delete().eq("id", location.id);

    setDeletingId(null);
    setConfirmId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setLocations((prev) => prev.filter((l) => l.id !== location.id));
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <MapPin size={16} /> Adauga locatie
        </div>
        <form className="form-row" onSubmit={handleAdd}>
          <div className="field">
            <label htmlFor="locationCode">Cod raft</label>
            <input
              id="locationCode"
              type="text"
              className="mono"
              placeholder="ex. A-01-02"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="locationZone">Zona</label>
            <input
              id="locationZone"
              type="text"
              placeholder="ex. A"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Se adauga..." : "Adauga locatie"}
          </button>
        </form>
        {error && <div className="auth-msg err">{error}</div>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cod</th>
              <th>Zona</th>
              <th>Adaugat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td className="mono strong">{l.code}</td>
                <td className="muted">{l.zone || "—"}</td>
                <td className="muted small">
                  {new Date(l.created_at).toLocaleDateString("ro-RO")}
                </td>
                <td className="actions">
                  {!isAdmin ? null : confirmId === l.id ? (
                    <span className="confirm-delete">
                      <span className="small muted">Sigur?</span>
                      <button
                        className="btn small ghost"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === l.id}
                      >
                        Nu
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => handleDelete(l)}
                        disabled={deletingId === l.id}
                      >
                        {deletingId === l.id ? "..." : "Da, sterge"}
                      </button>
                    </span>
                  ) : (
                    <button
                      className="icon-btn"
                      onClick={() => setConfirmId(l.id)}
                      title="Sterge locatia"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  <MapPin size={18} style={{ marginBottom: 6 }} />
                  <br />
                  Nicio locatie inca. Adauga prima mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

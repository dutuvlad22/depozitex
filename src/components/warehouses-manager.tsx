"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPinned, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type WarehouseRow = {
  id: string;
  name: string;
  city: string | null;
  created_at: string;
};

export default function WarehousesManager({
  organizationId,
  initialWarehouses,
}: {
  organizationId: string;
  initialWarehouses: WarehouseRow[];
}) {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>(initialWarehouses);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Scrie un nume de depozit.");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("warehouses")
      .insert({
        organization_id: organizationId,
        name: trimmedName,
        city: city.trim() || null,
      })
      .select("id, name, city, created_at")
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setWarehouses((prev) => [data as WarehouseRow, ...prev]);
    setName("");
    setCity("");
  }

  async function handleDelete(warehouse: WarehouseRow) {
    setError(null);
    setDeletingId(warehouse.id);

    const supabase = createClient();
    const { error } = await supabase.from("warehouses").delete().eq("id", warehouse.id);

    setDeletingId(null);
    setConfirmId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setWarehouses((prev) => prev.filter((w) => w.id !== warehouse.id));
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <WarehouseIcon size={16} /> Adauga depozit
        </div>
        <form className="form-row" onSubmit={handleAdd}>
          <div className="field">
            <label htmlFor="warehouseName">Nume</label>
            <input
              id="warehouseName"
              type="text"
              placeholder="ex. Depozit Giurgiu"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="warehouseCity">Oras</label>
            <input
              id="warehouseCity"
              type="text"
              placeholder="ex. Giurgiu"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Se adauga..." : "Adauga depozit"}
          </button>
        </form>
        {error && <div className="auth-msg err">{error}</div>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nume</th>
              <th>Oras</th>
              <th>Adaugat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id}>
                <td className="strong">{w.name}</td>
                <td className="muted">{w.city || "—"}</td>
                <td className="muted small">
                  {new Date(w.created_at).toLocaleDateString("ro-RO")}
                </td>
                <td className="actions">
                  {confirmId === w.id ? (
                    <span className="confirm-delete">
                      <span className="small muted">Sigur?</span>
                      <button
                        className="btn small ghost"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === w.id}
                      >
                        Nu
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => handleDelete(w)}
                        disabled={deletingId === w.id}
                      >
                        {deletingId === w.id ? "..." : "Da, sterge"}
                      </button>
                    </span>
                  ) : (
                    <span className="confirm-delete">
                      <Link href={`/depozite/${w.id}`} className="btn small ghost">
                        <MapPinned size={13} /> Locatii
                      </Link>
                      <button
                        className="icon-btn"
                        onClick={() => setConfirmId(w.id)}
                        title="Sterge depozitul"
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {warehouses.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  <WarehouseIcon size={18} style={{ marginBottom: 6 }} />
                  <br />
                  Niciun depozit inca. Adauga primul mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

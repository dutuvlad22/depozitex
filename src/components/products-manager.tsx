"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ClientOption = {
  id: string;
  name: string;
};

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  reorder_point: number;
  created_at: string;
  client_id: string;
  clients: { name: string } | null;
};

export default function ProductsManager({
  organizationId,
  clients,
  initialProducts,
}: {
  organizationId: string;
  clients: ClientOption[];
  initialProducts: ProductRow[];
}) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSku = sku.trim();
    const trimmedName = name.trim();
    if (!clientId) {
      setError("Alege un client.");
      return;
    }
    if (!trimmedSku || !trimmedName) {
      setError("Scrie SKU-ul si numele produsului.");
      return;
    }

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        sku: trimmedSku,
        name: trimmedName,
        reorder_point: Number(reorderPoint) || 0,
      })
      .select("id, sku, name, reorder_point, created_at, client_id, clients(name)")
      .single();

    setSaving(false);

    if (error) {
      setError(
        error.code === "23505"
          ? `SKU-ul "${trimmedSku}" exista deja.`
          : error.message
      );
      return;
    }

    setProducts((prev) => [data as unknown as ProductRow, ...prev]);
    setSku("");
    setName("");
    setReorderPoint("0");
  }

  async function handleDelete(product: ProductRow) {
    setError(null);
    setDeletingId(product.id);

    const supabase = createClient();
    const { error } = await supabase.from("products").delete().eq("id", product.id);

    setDeletingId(null);
    setConfirmId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setProducts((prev) => prev.filter((p) => p.id !== product.id));
  }

  if (clients.length === 0) {
    return (
      <div className="stack">
        <div className="hint">
          <Package size={16} />
          Adauga mai intai un client — produsele apartin unui client.{" "}
          <Link href="/clienti" className="auth-linklike">
            Mergi la Clienti
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <Package size={16} /> Adauga produs
        </div>
        <form className="form-row" onSubmit={handleAdd}>
          <div className="field">
            <label htmlFor="productClient">Client</label>
            <select
              id="productClient"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="productSku">SKU</label>
            <input
              id="productSku"
              type="text"
              className="mono"
              placeholder="ex. BBC-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="productName">Nume</label>
            <input
              id="productName"
              type="text"
              placeholder="ex. Monitor video bebe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="productReorder">Prag reaprovizionare</label>
            <input
              id="productReorder"
              type="number"
              min="0"
              style={{ minWidth: 90 }}
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Se adauga..." : "Adauga produs"}
          </button>
        </form>
        {error && <div className="auth-msg err">{error}</div>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produs</th>
              <th>Client</th>
              <th className="num">Prag</th>
              <th>Adaugat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="mono strong">{p.sku}</td>
                <td>{p.name}</td>
                <td className="muted">{p.clients?.name ?? "—"}</td>
                <td className="num">{p.reorder_point}</td>
                <td className="muted small">
                  {new Date(p.created_at).toLocaleDateString("ro-RO")}
                </td>
                <td className="actions">
                  {confirmId === p.id ? (
                    <span className="confirm-delete">
                      <span className="small muted">Sigur?</span>
                      <button
                        className="btn small ghost"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === p.id}
                      >
                        Nu
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => handleDelete(p)}
                        disabled={deletingId === p.id}
                      >
                        {deletingId === p.id ? "..." : "Da, sterge"}
                      </button>
                    </span>
                  ) : (
                    <button
                      className="icon-btn"
                      onClick={() => setConfirmId(p.id)}
                      title="Sterge produsul"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <Package size={18} style={{ marginBottom: 6 }} />
                  <br />
                  Niciun produs inca. Adauga primul mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

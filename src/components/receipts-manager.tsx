"use client";

import { useState } from "react";
import Link from "next/link";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ClientOption = { id: string; name: string };
export type WarehouseOption = { id: string; name: string };
export type ProductOption = { id: string; sku: string; name: string; client_id: string };
export type LocationOption = { id: string; code: string; warehouse_id: string };
export type ReceiptRow = {
  id: string;
  reference: string | null;
  status: string;
  created_at: string;
  clients: { name: string } | null;
  warehouses: { name: string } | null;
};

type LineDraft = {
  productId: string;
  locationId: string;
  quantity: string;
};

function emptyLine(): LineDraft {
  return { productId: "", locationId: "", quantity: "1" };
}

export default function ReceiptsManager({
  organizationId,
  clients,
  warehouses,
  products,
  locations,
  initialReceipts,
}: {
  organizationId: string;
  clients: ClientOption[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  locations: LocationOption[];
  initialReceipts: ReceiptRow[];
}) {
  const [receipts, setReceipts] = useState<ReceiptRow[]>(initialReceipts);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clientProducts = products.filter((p) => p.client_id === clientId);
  const warehouseLocations = locations.filter((l) => l.warehouse_id === warehouseId);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Alege un client.");
      return;
    }
    if (!warehouseId) {
      setError("Alege un depozit.");
      return;
    }

    const payloadLines = lines
      .filter((l) => l.productId && l.locationId)
      .map((l) => ({
        product_id: l.productId,
        location_id: l.locationId,
        quantity: Number(l.quantity),
      }));

    if (payloadLines.length === 0) {
      setError("Adauga cel putin o linie completa (produs + locatie).");
      return;
    }
    if (payloadLines.some((l) => !l.quantity || l.quantity <= 0)) {
      setError("Cantitatea trebuie sa fie un numar pozitiv pentru fiecare linie.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_receipt", {
      p_organization_id: organizationId,
      p_client_id: clientId,
      p_warehouse_id: warehouseId,
      p_reference: reference.trim(),
      p_lines: payloadLines,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    const clientName = clients.find((c) => c.id === clientId)?.name ?? "—";
    const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? "—";

    setReceipts((prev) => [
      {
        id: data as string,
        reference: reference.trim() || null,
        status: "confirmat",
        created_at: new Date().toISOString(),
        clients: { name: clientName },
        warehouses: { name: warehouseName },
      },
      ...prev,
    ]);

    setReference("");
    setLines([emptyLine()]);
  }

  if (clients.length === 0 || warehouses.length === 0 || products.length === 0) {
    const missing: string[] = [];
    if (clients.length === 0) missing.push("clienti");
    if (warehouses.length === 0) missing.push("depozite");
    if (products.length === 0) missing.push("produse");

    return (
      <div className="stack">
        <div className="hint">
          <PackagePlus size={16} />
          Ai nevoie de cel putin: {missing.join(", ")} inainte sa poti inregistra o receptie.{" "}
          {clients.length === 0 && <Link href="/clienti" className="auth-linklike">Clienti</Link>}{" "}
          {warehouses.length === 0 && <Link href="/depozite" className="auth-linklike">Depozite</Link>}{" "}
          {products.length === 0 && <Link href="/produse" className="auth-linklike">Produse</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <PackagePlus size={16} /> Receptie noua
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="receiptClient">Client</label>
              <select
                id="receiptClient"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setLines([emptyLine()]);
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="receiptWarehouse">Depozit</label>
              <select
                id="receiptWarehouse"
                value={warehouseId}
                onChange={(e) => {
                  setWarehouseId(e.target.value);
                  setLines([emptyLine()]);
                }}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="receiptReference">Referinta (optional)</label>
              <input
                id="receiptReference"
                type="text"
                placeholder="ex. AWB furnizor, comanda"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="lines-head">Linii receptie</div>

          {clientProducts.length === 0 ? (
            <div className="auth-msg err">Clientul ales nu are niciun produs. Adauga produse mai intai.</div>
          ) : warehouseLocations.length === 0 ? (
            <div className="auth-msg err">Depozitul ales nu are nicio locatie. Adauga locatii mai intai.</div>
          ) : (
            <>
              {lines.map((line, i) => (
                <div key={i} className="line-edit">
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(i, { productId: e.target.value })}
                  >
                    <option value="">Alege produs...</option>
                    {clientProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={line.locationId}
                    onChange={(e) => updateLine(i, { locationId: e.target.value })}
                  >
                    <option value="">Locatie...</option>
                    {warehouseLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className="mono"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeLine(i)}
                      title="Sterge linia"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn ghost small" onClick={addLine}>
                <Plus size={14} /> Adauga linie
              </button>
            </>
          )}

          {error && <div className="auth-msg err">{error}</div>}

          <button className="btn primary" type="submit" disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Se inregistreaza..." : "Inregistreaza receptia"}
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Client</th>
              <th>Depozit</th>
              <th>Referinta</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="muted small">
                  {new Date(r.created_at).toLocaleDateString("ro-RO")}
                </td>
                <td className="strong">{r.clients?.name ?? "—"}</td>
                <td>{r.warehouses?.name ?? "—"}</td>
                <td className="muted">{r.reference || "—"}</td>
                <td>
                  <span className="pill ok">{r.status === "confirmat" ? "Confirmat" : "Draft"}</span>
                </td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  <PackagePlus size={18} style={{ marginBottom: 6 }} />
                  <br />
                  Nicio receptie inca. Inregistreaza prima mai sus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

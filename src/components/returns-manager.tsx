"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type OrderLine = {
  product_id: string;
  quantity: number;
  products: { sku: string; name: string } | null;
};

export type ShipmentOption = {
  id: string;
  awb: string;
  orders: {
    order_no: string;
    clients: { name: string } | null;
    order_lines: OrderLine[];
  } | null;
};

export type ReturnRow = {
  id: string;
  quantity: number;
  disposition: string;
  created_at: string;
  products: { sku: string; name: string } | null;
  shipments: { awb: string } | null;
};

export default function ReturnsManager({
  organizationId,
  shipments,
  initialReturns,
}: {
  organizationId: string;
  shipments: ShipmentOption[];
  initialReturns: ReturnRow[];
}) {
  const [returns, setReturns] = useState<ReturnRow[]>(initialReturns);
  const [shipmentId, setShipmentId] = useState(shipments[0]?.id ?? "");
  const selectedShipment = shipments.find((s) => s.id === shipmentId);
  const lines = selectedShipment?.orders?.order_lines ?? [];
  const [productId, setProductId] = useState(lines[0]?.product_id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [disposition, setDisposition] = useState<"restock" | "defect">("restock");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleShipmentChange(id: string) {
    setShipmentId(id);
    const s = shipments.find((x) => x.id === id);
    setProductId(s?.orders?.order_lines[0]?.product_id ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!shipmentId || !productId) {
      setError("Alege un AWB si un produs.");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Cantitatea trebuie sa fie un numar pozitiv.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_return", {
      p_organization_id: organizationId,
      p_shipment_id: shipmentId,
      p_product_id: productId,
      p_quantity: qty,
      p_disposition: disposition,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const product = lines.find((l) => l.product_id === productId)?.products ?? null;
    setReturns((prev) => [
      {
        id: `local-${Date.now()}`,
        quantity: qty,
        disposition,
        created_at: new Date().toISOString(),
        products: product,
        shipments: selectedShipment ? { awb: selectedShipment.awb } : null,
      },
      ...prev,
    ]);

    setQuantity("1");
  }

  if (shipments.length === 0) {
    return (
      <div className="stack">
        <div className="hint">
          <RotateCcw size={16} />
          Inregistreaza coletele returnate. Poti reintroduce marfa in stoc sau marca produsul ca defect.
        </div>
        <div className="empty-state">
          <RotateCcw size={28} strokeWidth={1.75} />
          <h2>Nicio expediere inca</h2>
          <p>Ai nevoie de cel putin o comanda expediata (cu AWB) inainte sa poti inregistra un retur.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="hint">
        <RotateCcw size={16} />
        Inregistreaza coletele returnate. Poti reintroduce marfa in stoc sau marca produsul ca defect.
      </div>

      <div className="panel">
        <div className="panel-head">
          <RotateCcw size={16} /> Retur nou
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="returnAwb">AWB expediere</label>
              <select
                id="returnAwb"
                value={shipmentId}
                onChange={(e) => handleShipmentChange(e.target.value)}
              >
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.awb} — {s.orders?.order_no} {s.orders?.clients?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="returnProduct">Produs returnat</label>
              <select
                id="returnProduct"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {lines.map((l) => (
                  <option key={l.product_id} value={l.product_id}>
                    {l.products?.sku} — {l.products?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="returnQty">Cantitate</label>
              <input
                id="returnQty"
                type="number"
                min="1"
                className="mono"
                style={{ minWidth: 90 }}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="lines-head">Decizie</div>
          <div className="radio-row">
            <button
              type="button"
              className={`radio ${disposition === "restock" ? "on" : ""}`}
              onClick={() => setDisposition("restock")}
            >
              Reintrodu in stoc
            </button>
            <button
              type="button"
              className={`radio ${disposition === "defect" ? "on" : ""}`}
              onClick={() => setDisposition("defect")}
            >
              Marcheaza defect
            </button>
          </div>

          {error && <div className="auth-msg err">{error}</div>}

          <button className="btn primary" type="submit" disabled={saving} style={{ marginTop: 16 }}>
            {saving ? "Se inregistreaza..." : "Inregistreaza retur"}
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>AWB retur</th>
              <th>SKU</th>
              <th>Produs</th>
              <th className="num">Cant.</th>
              <th>Decizie</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.shipments?.awb ?? "—"}</td>
                <td className="mono">{r.products?.sku ?? "—"}</td>
                <td>{r.products?.name ?? "—"}</td>
                <td className="num">{r.quantity}</td>
                <td>
                  <span className={`pill ${r.disposition === "restock" ? "ok" : "red"}`}>
                    {r.disposition === "restock" ? "In stoc" : "Defect"}
                  </span>
                </td>
                <td className="muted">{new Date(r.created_at).toLocaleDateString("ro-RO")}</td>
              </tr>
            ))}
            {returns.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Niciun retur inregistrat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

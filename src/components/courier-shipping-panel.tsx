"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Send, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type OrderRecipient = {
  id: string;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  address_street: string | null;
  address_number: string | null;
  city: string | null;
  county: string | null;
  postal_code: string | null;
  country: string | null;
  weight_kg: number | null;
  parcels_count: number | null;
  cod_amount: number | null;
};

type ShipmentInfo = {
  awb: string | null;
  status: string | null;
  error: string | null;
  updated_at: string | null;
};

type ServiceType = { name: string; value: string };

type AwbGetResponse = {
  order: OrderRecipient;
  shipment: ShipmentInfo | null;
  serviceTypes: ServiceType[];
  configured: boolean;
};

const STATUS_TONE: Record<string, string> = {
  delivered: "ok",
  livrat: "ok",
  active: "",
  in_curs: "",
  uncollected: "scazut",
  neridicat: "scazut",
  draft: "scazut",
  initial: "scazut",
  canceled: "red",
  cancelled: "red",
  anulat: "red",
  exception: "red",
  exceptie: "red",
  eroare: "red",
};

const CANCELLED = new Set(["canceled", "cancelled", "anulat"]);

function recipientComplete(order: OrderRecipient) {
  return Boolean(
    order.recipient_name &&
      order.recipient_phone &&
      order.address_street &&
      order.city &&
      order.county &&
      order.weight_kg &&
      order.parcels_count
  );
}

export default function CourierShippingPanel({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRecipient | null>(null);
  const [shipment, setShipment] = useState<ShipmentInfo | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [configured, setConfigured] = useState(true);

  const [form, setForm] = useState({
    recipient_name: "",
    recipient_phone: "",
    address_street: "",
    address_number: "",
    city: "",
    county: "",
    postal_code: "",
    weight_kg: "",
    parcels_count: "1",
    cod_amount: "",
    serviceType: "",
  });

  const [savingRecipient, setSavingRecipient] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/courier-manager/orders/${orderId}/awb`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as AwbGetResponse;
    setOrder(data.order);
    setShipment(data.shipment);
    setServiceTypes(data.serviceTypes);
    setConfigured(data.configured);
    setForm((prev) => ({
      ...prev,
      recipient_name: data.order.recipient_name ?? "",
      recipient_phone: data.order.recipient_phone ?? "",
      address_street: data.order.address_street ?? "",
      address_number: data.order.address_number ?? "",
      city: data.order.city ?? "",
      county: data.order.county ?? "",
      postal_code: data.order.postal_code ?? "",
      weight_kg: data.order.weight_kg ? String(data.order.weight_kg) : "",
      parcels_count: data.order.parcels_count ? String(data.order.parcels_count) : "1",
      cod_amount: data.order.cod_amount ? String(data.order.cod_amount) : "",
      serviceType: prev.serviceType || data.serviceTypes[0]?.value || "",
    }));
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSaveRecipient(e: React.FormEvent) {
    e.preventDefault();
    setSavingRecipient(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        recipient_name: form.recipient_name.trim() || null,
        recipient_phone: form.recipient_phone.trim() || null,
        address_street: form.address_street.trim() || null,
        address_number: form.address_number.trim() || null,
        city: form.city.trim() || null,
        county: form.county.trim() || null,
        postal_code: form.postal_code.trim() || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        parcels_count: form.parcels_count ? Number(form.parcels_count) : 1,
        cod_amount: form.cod_amount ? Number(form.cod_amount) : null,
      })
      .eq("id", orderId);

    setSavingRecipient(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load();
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const res = await fetch(`/api/courier-manager/orders/${orderId}/awb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: form.serviceType }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setGenerating(false);

    if (!res.ok || !data.ok) {
      setError(data.error ?? "Generarea AWB a esuat.");
      return;
    }

    await load();
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);

    const res = await fetch(`/api/courier-manager/orders/${orderId}/refresh-status`, {
      method: "POST",
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setRefreshing(false);

    if (!res.ok || !data.ok) {
      setError(data.error ?? "Nu am putut reimprospata statusul.");
      return;
    }

    await load();
  }

  if (loading || !order) {
    return null;
  }

  const shipmentStatus = (shipment?.status ?? "").toLowerCase();
  const hasActiveAwb = Boolean(shipment?.awb) && !CANCELLED.has(shipmentStatus);
  const complete = recipientComplete(order);

  return (
    <div className="panel">
      <div className="panel-head">
        <Truck size={16} /> Expediere
      </div>

      {!configured && (
        <div className="auth-msg err">
          Contul Courier Manager nu este configurat. Mergi la &bdquo;Setari curier&rdquo; din meniu.
        </div>
      )}

      {!hasActiveAwb && (
        <form onSubmit={handleSaveRecipient}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="rName">Nume destinatar</label>
              <input
                id="rName"
                type="text"
                value={form.recipient_name}
                onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rPhone">Telefon</label>
              <input
                id="rPhone"
                type="text"
                value={form.recipient_phone}
                onChange={(e) => setForm((f) => ({ ...f, recipient_phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="rStreet">Strada</label>
              <input
                id="rStreet"
                type="text"
                value={form.address_street}
                onChange={(e) => setForm((f) => ({ ...f, address_street: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rNumber">Numar</label>
              <input
                id="rNumber"
                type="text"
                style={{ minWidth: 80 }}
                value={form.address_number}
                onChange={(e) => setForm((f) => ({ ...f, address_number: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="rCity">Oras</label>
              <input
                id="rCity"
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rCounty">Judet</label>
              <input
                id="rCounty"
                type="text"
                value={form.county}
                onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rZip">Cod postal</label>
              <input
                id="rZip"
                type="text"
                style={{ minWidth: 100 }}
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="rWeight">Greutate (kg)</label>
              <input
                id="rWeight"
                type="number"
                step="0.1"
                min="0"
                className="mono"
                style={{ minWidth: 90 }}
                value={form.weight_kg}
                onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rParcels">Colete</label>
              <input
                id="rParcels"
                type="number"
                min="1"
                className="mono"
                style={{ minWidth: 80 }}
                value={form.parcels_count}
                onChange={(e) => setForm((f) => ({ ...f, parcels_count: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="rCod">Ramburs (optional, RON)</label>
              <input
                id="rCod"
                type="number"
                step="0.01"
                min="0"
                className="mono"
                style={{ minWidth: 110 }}
                value={form.cod_amount}
                onChange={(e) => setForm((f) => ({ ...f, cod_amount: e.target.value }))}
              />
            </div>
          </div>

          <button className="btn ghost small" type="submit" disabled={savingRecipient}>
            {savingRecipient ? "Se salveaza..." : "Salveaza datele de livrare"}
          </button>

          <div className="lines-head" style={{ marginTop: 16 }}>
            Generare AWB
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="rService">Tip serviciu</label>
              <select
                id="rService"
                value={form.serviceType}
                onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
              >
                <option value="">Alege...</option>
                {serviceTypes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="auth-msg err">{error}</div>}
          {shipment?.error && !error && (
            <div className="auth-msg err">Ultima incercare a esuat: {shipment.error}</div>
          )}

          <button
            className="btn primary"
            type="button"
            onClick={handleGenerate}
            disabled={generating || !complete || !form.serviceType || !configured}
            style={{ marginTop: 12 }}
          >
            <Send size={14} /> {generating ? "Se genereaza..." : "Genereaza AWB"}
          </button>
          {!complete && (
            <div className="hint" style={{ marginTop: 8 }}>
              Completeaza datele de livrare de mai sus (nume, telefon, strada, oras, judet, greutate,
              colete) inainte sa generezi AWB-ul.
            </div>
          )}
        </form>
      )}

      {hasActiveAwb && shipment && (
        <div>
          <div className="alert-row">
            <div>
              <span className="mono strong">{shipment.awb}</span>
            </div>
            <div className="alert-right">
              <span className={`pill ${STATUS_TONE[shipmentStatus] ?? ""}`}>{shipment.status}</span>
              <button
                className="icon-btn"
                type="button"
                title="Reimprospateaza statusul"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <a
            className="btn ghost small"
            href={`/api/courier-manager/orders/${orderId}/label`}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 12 }}
          >
            <Download size={14} /> Descarca eticheta
          </a>

          {error && (
            <div className="auth-msg err" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

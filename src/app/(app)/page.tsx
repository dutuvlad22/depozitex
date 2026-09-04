import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Clock,
  MapPin,
  PackageCheck,
  RotateCcw,
  Truck,
} from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";

type InventoryRow = {
  id: string;
  quantity: number;
  products: { sku: string; name: string; reorder_point: number } | null;
  locations: { code: string } | null;
};

const MOVEMENT_LABEL: Record<string, string> = {
  receptie: "Receptie",
  pick: "Pick comanda",
  ajustare: "Ajustare stoc",
  retur: "Retur in stoc",
};

export default async function PanouPage() {
  const { supabase, organizationId } = await requireOrgContext();

  const [
    { count: skuCount },
    { data: inventoryRows },
    { data: orders },
    { data: shipments },
    { count: returnsCount },
    { data: movements },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("inventory")
      .select("id, quantity, products(sku, name, reorder_point), locations(code)")
      .eq("organization_id", organizationId),
    supabase.from("orders").select("id, status").eq("organization_id", organizationId),
    supabase
      .from("shipments")
      .select("id, shipped_at")
      .eq("organization_id", organizationId),
    supabase
      .from("returns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity_change, created_at, products(sku)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const inventory = (inventoryRows ?? []) as unknown as InventoryRow[];
  const units = inventory.reduce((sum, r) => sum + r.quantity, 0);
  const lowStock = inventory.filter(
    (r) => r.quantity <= (r.products?.reorder_point ?? 0)
  );
  const openOrders = (orders ?? []).filter(
    (o) => o.status !== "expediat" && o.status !== "anulat"
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const shippedToday = (shipments ?? []).filter(
    (s) => s.shipped_at && s.shipped_at.slice(0, 10) === today
  ).length;

  const cards = [
    { label: "SKU-uri active", val: skuCount ?? 0, icon: Boxes, tone: "" },
    { label: "Unitati in stoc", val: units, icon: PackageCheck, tone: "" },
    { label: "Comenzi deschise", val: openOrders, icon: ClipboardList, tone: "amber" },
    { label: "Expediate azi", val: shippedToday, icon: Truck, tone: "green" },
    {
      label: "Alerte stoc",
      val: lowStock.length,
      icon: AlertTriangle,
      tone: lowStock.length ? "red" : "",
    },
    { label: "Retururi", val: returnsCount ?? 0, icon: RotateCcw, tone: "" },
  ];

  return (
    <div className="stack">
      <div className="kpi-grid">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`kpi ${c.tone}`}>
              <div className="kpi-icon">
                <Icon size={18} />
              </div>
              <div className="kpi-val">{c.val}</div>
              <div className="kpi-label">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <AlertTriangle size={16} /> Alerte reaprovizionare
          </div>
          {lowStock.length === 0 && (
            <div className="empty">Toate stocurile sunt peste prag.</div>
          )}
          {lowStock.map((r) => {
            const status = r.quantity <= 0 ? "epuizat" : "scazut";
            return (
              <div key={r.id} className="alert-row">
                <div>
                  <span className="mono">{r.products?.sku ?? "—"}</span>
                  <span className="alert-name">{r.products?.name ?? "—"}</span>
                </div>
                <div className="alert-right">
                  <span className={`pill ${status}`}>{r.quantity} buc</span>
                  <span className="muted">
                    <MapPin size={11} style={{ verticalAlign: -1 }} /> {r.locations?.code ?? "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <div className="panel-head">
            <Clock size={16} /> Activitate recenta
          </div>
          {(!movements || movements.length === 0) && (
            <div className="empty">Nicio miscare de stoc inca.</div>
          )}
          {(movements ?? []).map((m) => {
            const sku = (m as unknown as { products: { sku: string } | null }).products?.sku;
            const sign = m.quantity_change > 0 ? "+" : "";
            return (
              <div key={m.id} className="act-row">
                <span className="mono act-time">
                  {new Date(m.created_at).toLocaleDateString("ro-RO", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <span>
                  {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type} · {sku ?? "—"} (
                  {sign}
                  {m.quantity_change})
                </span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

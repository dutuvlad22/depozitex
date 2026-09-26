import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageCheck, ShoppingCart } from "lucide-react";
import CourierShippingPanel from "@/components/courier-shipping-panel";
import { requireOrgContext } from "@/lib/org-context";
import { boxLabel } from "@/lib/cart-codes";

const STATUS_LABEL: Record<string, string> = {
  nou: "Nou",
  de_pregatit: "In picking",
  la_ambalare: "La ambalare",
  ambalat: "Ambalat",
  expediat: "Expediat",
  anulat: "Anulat",
};
const STATUS_TONE: Record<string, string> = {
  de_pregatit: "scazut",
  la_ambalare: "scazut",
  ambalat: "ok",
  expediat: "ok",
  anulat: "epuizat",
};

type Line = {
  id: string;
  quantity: number;
  picked_quantity: number;
  packed_quantity: number;
  products: { sku: string; name: string } | null;
  order_pick_lines: { quantity: number; picked_quantity: number; locations: { code: string } | null }[];
};

type Box = { box_no: number; cart_runs: { status: string; carts: { code: string } | null } | null };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrgContext();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_no, status, created_at, source, clients(name), assignee:profiles!orders_assigned_to_fkey(email), cart_run_boxes(box_no, cart_runs(status, carts(code)))"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!order) notFound();

  const { data: lineData } = await supabase
    .from("order_lines")
    .select(
      "id, quantity, picked_quantity, packed_quantity, products(sku, name), order_pick_lines(quantity, picked_quantity, locations(code))"
    )
    .eq("order_id", id)
    .order("id");

  const lines = (lineData ?? []) as unknown as Line[];
  const boxes = (order.cart_run_boxes ?? []) as unknown as Box[];
  const box = boxes.find((b) => b.cart_runs && b.cart_runs.status !== "inchis");
  const cart = box?.cart_runs?.carts?.code;
  const status = order.status as string;
  // in picking, "luat" vine din alocari (se aduna pe linia comenzii abia la "Carucior gata")
  const pickedOf = (l: Line) =>
    status === "de_pregatit" ? l.order_pick_lines.reduce((s, p) => s + p.picked_quantity, 0) : l.picked_quantity;

  return (
    <div className="stack">
      <Link href="/comenzi" className="back-link">
        <ArrowLeft size={14} /> Comenzi
      </Link>

      <div className="page-heading">
        <h2 className="mono">{order.order_no}</h2>
        <span className="muted">{(order.clients as unknown as { name: string } | null)?.name ?? "—"}</span>
        <span className={`pill ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>
        {order.source === "api" && <span className="source-tag">API</span>}
      </div>
      <div className="hint">
        Creata {new Date(order.created_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
        {(order.assignee as unknown as { email: string | null } | null)?.email &&
          ` · picker: ${(order.assignee as unknown as { email: string }).email}`}
      </div>

      {status === "nou" && (
        <div className="hint">
          <ShoppingCart size={14} /> Comanda asteapta sa fie preluata pe un carucior (ecranul Picking).
        </div>
      )}
      {cart && box && (
        <div className="hint">
          <ShoppingCart size={14} /> Caruciorul <span className="mono strong">{cart}</span>, cutia{" "}
          <span className="mono strong">{boxLabel(box.box_no)}</span>
          {status === "la_ambalare" && (
            <>
              {" · "}
              <Link href={`/ambalare?carucior=${cart}&cutie=${box.box_no}`} className="strong">
                <PackageCheck size={13} style={{ verticalAlign: -2 }} /> Deschide la ambalare
              </Link>
            </>
          )}
        </div>
      )}

      <div className="table-wrap report-table">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produs</th>
              <th>Locatii</th>
              <th className="num">Comandat</th>
              <th className="num">Luat</th>
              <th className="num">Verificat la ambalare</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const picked = pickedOf(l);
              const pickDone = status !== "nou";
              const packDone = status === "ambalat" || status === "expediat" || status === "la_ambalare";
              return (
                <tr key={l.id}>
                  <td className="mono strong">{l.products?.sku ?? "—"}</td>
                  <td>{l.products?.name ?? "—"}</td>
                  <td className="mono small">
                    {l.order_pick_lines.map((p) => `${p.locations?.code ?? "—"} (${p.quantity})`).join(", ") || "—"}
                  </td>
                  <td className="num">{l.quantity}</td>
                  <td className={`num ${pickDone && picked < l.quantity ? "qty-out strong" : ""}`}>
                    {pickDone ? picked : "—"}
                  </td>
                  <td className={`num ${packDone && l.packed_quantity !== l.quantity && status !== "la_ambalare" ? "qty-out strong" : ""}`}>
                    {packDone ? l.packed_quantity : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(status === "ambalat" || status === "expediat") && <CourierShippingPanel orderId={order.id} />}
    </div>
  );
}

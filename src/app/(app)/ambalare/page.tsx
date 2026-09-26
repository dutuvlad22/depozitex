import PackingStation, { type PackBox, type PackOrder } from "@/components/packing-station";
import { requireOrgContext } from "@/lib/org-context";
import { normalizeCartCode } from "@/lib/cart-codes";
import { param, type SearchParams } from "@/lib/reports/period";

type BoxQuery = {
  box_no: number;
  packed_at: string | null;
  orders: { id: string; order_no: string; status: string; clients: { name: string } | null } | null;
};

export default async function AmbalarePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, organizationId } = await requireOrgContext();
  const cartCode = normalizeCartCode(param(sp, "carucior"));
  const boxNo = Number.parseInt(param(sp, "cutie"), 10) || null;

  // caruciorele care asteapta la ambalare (ca sa nu fie nevoie de scanare daca e unul singur)
  const { data: waitingRuns } = await supabase
    .from("cart_runs")
    .select("id, carts(code), cart_run_boxes(packed_at)")
    .eq("organization_id", organizationId)
    .eq("status", "la_ambalare")
    .order("picked_at");
  const waitingCarts = ((waitingRuns ?? []) as unknown as {
    carts: { code: string } | null;
    cart_run_boxes: { packed_at: string | null }[];
  }[]).map((r) => ({
    code: r.carts?.code ?? "—",
    left: r.cart_run_boxes.filter((b) => !b.packed_at).length,
  }));

  let cartError: string | null = null;
  let boxes: PackBox[] = [];
  let order: PackOrder | null = null;

  if (cartCode) {
    const { data: run } = await supabase
      .from("cart_runs")
      .select("id, status, carts!inner(code), cart_run_boxes(box_no, packed_at, orders(id, order_no, status, clients(name)))")
      .eq("organization_id", organizationId)
      .eq("carts.code", cartCode)
      .neq("status", "inchis")
      .maybeSingle();

    if (!run) {
      cartError = `Caruciorul ${cartCode} nu are nimic de ambalat.`;
    } else if (run.status === "picking") {
      cartError = `Caruciorul ${cartCode} e inca in picking. Pickerul trebuie sa apese „Carucior gata”.`;
    } else {
      boxes = ((run.cart_run_boxes ?? []) as unknown as BoxQuery[])
        .map((b) => ({
          box: b.box_no,
          packed: Boolean(b.packed_at),
          orderId: b.orders?.id ?? "",
          orderNo: b.orders?.order_no ?? "—",
          clientName: b.orders?.clients?.name ?? "—",
        }))
        .sort((a, b) => a.box - b.box);

      const selected = boxes.find((b) => b.box === boxNo);
      if (selected) {
        const [{ data: o }, { data: lines }] = await Promise.all([
          supabase.from("orders").select("id, order_no, status").eq("id", selected.orderId).single(),
          supabase
            .from("order_lines")
            .select("id, quantity, picked_quantity, packed_quantity, products(sku, name)")
            .eq("order_id", selected.orderId),
        ]);
        if (o) {
          order = {
            id: o.id,
            orderNo: o.order_no,
            status: o.status,
            box: selected.box,
            clientName: selected.clientName,
            lines: ((lines ?? []) as unknown as {
              id: string;
              quantity: number;
              picked_quantity: number;
              packed_quantity: number;
              products: { sku: string; name: string } | null;
            }[])
              .map((l) => ({
                id: l.id,
                sku: l.products?.sku ?? "—",
                name: l.products?.name ?? "—",
                quantity: l.quantity,
                picked: l.picked_quantity,
                packed: l.packed_quantity,
              }))
              .sort((a, b) => a.sku.localeCompare(b.sku)),
          };
        }
      }
    }
  }

  return (
    <PackingStation
      key={`${cartCode}|${boxNo ?? ""}`}
      cartCode={cartCode || null}
      cartError={cartError}
      waitingCarts={waitingCarts}
      boxes={boxes}
      order={order}
    />
  );
}

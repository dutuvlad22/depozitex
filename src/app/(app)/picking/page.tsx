import PickingStation, { type CartRun, type PickRow } from "@/components/picking-station";
import { requireOrgContext } from "@/lib/org-context";

type PickLineQuery = {
  id: string;
  quantity: number;
  picked_quantity: number;
  locations: { code: string } | null;
  order_lines: { order_id: string; products: { sku: string; name: string } | null } | null;
};

export default async function PickingPage() {
  const { supabase, organizationId, user } = await requireOrgContext();

  const [{ data: run }, { count: waiting }] = await Promise.all([
    // caruciorul pe care pickerul il are in lucru (unul singur odata)
    supabase
      .from("cart_runs")
      .select("id, carts(code), cart_run_boxes(box_no, order_id, orders(order_no))")
      .eq("organization_id", organizationId)
      .eq("picker_id", user.id)
      .eq("status", "picking")
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "nou"),
  ]);

  let current: CartRun | null = null;
  if (run) {
    const boxes = (run.cart_run_boxes ?? []) as unknown as {
      box_no: number;
      order_id: string;
      orders: { order_no: string } | null;
    }[];
    const boxByOrder = new Map(boxes.map((b) => [b.order_id, b]));

    const { data: pickLines } = await supabase
      .from("order_pick_lines")
      .select("id, quantity, picked_quantity, locations(code), order_lines!inner(order_id, products(sku, name))")
      .in("order_lines.order_id", boxes.map((b) => b.order_id));

    const rows: PickRow[] = ((pickLines ?? []) as unknown as PickLineQuery[])
      .map((p) => {
        const box = boxByOrder.get(p.order_lines?.order_id ?? "");
        return {
          id: p.id,
          box: box?.box_no ?? 0,
          orderNo: box?.orders?.order_no ?? "—",
          sku: p.order_lines?.products?.sku ?? "—",
          name: p.order_lines?.products?.name ?? "—",
          location: p.locations?.code ?? "—",
          quantity: p.quantity,
          picked: p.picked_quantity,
        };
      })
      // traseul prin depozit: locatie, apoi produs, apoi cutie
      .sort(
        (a, b) =>
          a.location.localeCompare(b.location, "ro", { numeric: true }) ||
          a.sku.localeCompare(b.sku) ||
          a.box - b.box
      );

    current = {
      id: run.id,
      cartCode: (run.carts as unknown as { code: string } | null)?.code ?? "—",
      boxCount: boxes.length,
      rows,
    };
  }

  return (
    <PickingStation
      key={current?.id ?? "start"}
      organizationId={organizationId}
      run={current}
      waiting={waiting ?? 0}
    />
  );
}

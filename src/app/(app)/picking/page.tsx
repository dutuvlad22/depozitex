import PickingStation, { type CurrentOrder, type PickRow } from "@/components/picking-station";
import { requireOrgContext } from "@/lib/org-context";

type LineWithPicks = {
  products: { sku: string; name: string } | null;
  order_pick_lines: { id: string; quantity: number; picked_quantity: number; locations: { code: string } | null }[];
};

export default async function PickingPage() {
  const { supabase, organizationId, user } = await requireOrgContext();

  const [{ data: order }, { count: waitingNew }, { count: waitingReleased }] = await Promise.all([
    // comanda pe care pickerul o are deja inceputa (una singura odata)
    supabase
      .from("orders")
      .select("id, order_no, clients(name)")
      .eq("organization_id", organizationId)
      .eq("status", "de_pregatit")
      .eq("assigned_to", user.id)
      .order("assigned_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "nou")
      .is("assigned_to", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "de_pregatit")
      .is("assigned_to", null),
  ]);

  let current: CurrentOrder | null = null;
  if (order) {
    const { data: lines } = await supabase
      .from("order_lines")
      .select("products(sku, name), order_pick_lines(id, quantity, picked_quantity, locations(code))")
      .eq("order_id", order.id);

    const rows: PickRow[] = ((lines ?? []) as unknown as LineWithPicks[])
      .flatMap((l) =>
        l.order_pick_lines.map((p) => ({
          id: p.id,
          sku: l.products?.sku ?? "—",
          name: l.products?.name ?? "—",
          location: p.locations?.code ?? "—",
          quantity: p.quantity,
          picked: p.picked_quantity,
        }))
      )
      // traseul prin depozit: in ordinea codurilor de locatie
      .sort((a, b) => a.location.localeCompare(b.location, "ro", { numeric: true }) || a.sku.localeCompare(b.sku));

    current = {
      id: order.id,
      orderNo: order.order_no,
      clientName: (order.clients as unknown as { name: string } | null)?.name ?? "—",
      rows,
    };
  }

  return (
    <PickingStation
      key={current?.id ?? "coada"}
      organizationId={organizationId}
      current={current}
      waiting={(waitingNew ?? 0) + (waitingReleased ?? 0)}
    />
  );
}

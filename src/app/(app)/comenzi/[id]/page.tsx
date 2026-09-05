import { notFound } from "next/navigation";
import OrderPickScanner, { type OrderLineWithPicks } from "@/components/order-pick-scanner";
import { requireOrgContext } from "@/lib/org-context";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrgContext();

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, status, created_at, clients(name)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!order) {
    notFound();
  }

  const { data: lines } = await supabase
    .from("order_lines")
    .select(
      "id, quantity, picked_quantity, products(sku, name), order_pick_lines(id, quantity, picked_quantity, locations(code))"
    )
    .eq("order_id", id)
    .order("id", { ascending: true });

  return (
    <OrderPickScanner
      orderId={order.id}
      orderNo={order.order_no}
      status={order.status}
      createdAt={order.created_at}
      clientName={(order.clients as unknown as { name: string } | null)?.name ?? "—"}
      initialLines={(lines ?? []) as unknown as OrderLineWithPicks[]}
    />
  );
}

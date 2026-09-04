import ShipmentsView, { type ShipmentRow } from "@/components/shipments-view";
import { requireOrgContext } from "@/lib/org-context";

export default async function ExpedierePage() {
  const { supabase, organizationId } = await requireOrgContext();

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, awb, courier, status, shipped_at, orders(order_no, clients(name))")
    .eq("organization_id", organizationId)
    .order("shipped_at", { ascending: false })
    .limit(100);

  return <ShipmentsView shipments={(shipments ?? []) as unknown as ShipmentRow[]} />;
}

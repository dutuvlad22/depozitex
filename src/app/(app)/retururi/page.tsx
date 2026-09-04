import ReturnsManager, {
  type ShipmentOption,
  type ReturnRow,
} from "@/components/returns-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function RetururiPage() {
  const { supabase, organizationId } = await requireOrgContext();

  const [{ data: shipments }, { data: returns }] = await Promise.all([
    supabase
      .from("shipments")
      .select(
        "id, awb, orders(order_no, clients(name), order_lines(product_id, quantity, products(sku, name)))"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("returns")
      .select("id, quantity, disposition, created_at, products(sku, name), shipments(awb)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <ReturnsManager
      organizationId={organizationId}
      shipments={(shipments ?? []) as unknown as ShipmentOption[]}
      initialReturns={(returns ?? []) as unknown as ReturnRow[]}
    />
  );
}

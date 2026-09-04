import StockView, { type InventoryRow } from "@/components/stock-view";
import { requireOrgContext } from "@/lib/org-context";

export default async function StocPage() {
  const { supabase, organizationId } = await requireOrgContext();

  const { data: inventory } = await supabase
    .from("inventory")
    .select(
      "id, quantity, updated_at, products(sku, name, reorder_point, clients(name)), locations(code, warehouses(name))"
    )
    .eq("organization_id", organizationId);

  return <StockView initialRows={(inventory ?? []) as unknown as InventoryRow[]} />;
}

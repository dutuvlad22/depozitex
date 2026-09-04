import WarehousesManager, { type WarehouseRow } from "@/components/warehouses-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function DepozitePage() {
  const { supabase, organizationId, isAdmin } = await requireOrgContext();

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name, city, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return (
    <WarehousesManager
      organizationId={organizationId}
      initialWarehouses={(warehouses ?? []) as WarehouseRow[]}
      isAdmin={isAdmin}
    />
  );
}

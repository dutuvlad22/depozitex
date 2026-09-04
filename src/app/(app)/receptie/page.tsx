import ReceiptsManager, {
  type ClientOption,
  type WarehouseOption,
  type ProductOption,
  type LocationOption,
  type ReceiptRow,
} from "@/components/receipts-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function ReceptiePage() {
  const { supabase, organizationId } = await requireOrgContext();

  const [
    { data: clients },
    { data: warehouses },
    { data: products },
    { data: locations },
    { data: receipts },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, sku, name, client_id")
      .eq("organization_id", organizationId)
      .order("sku", { ascending: true }),
    supabase
      .from("locations")
      .select("id, code, warehouse_id")
      .eq("organization_id", organizationId)
      .order("code", { ascending: true }),
    supabase
      .from("receipts")
      .select("id, reference, status, created_at, clients(name), warehouses(name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <ReceiptsManager
      organizationId={organizationId}
      clients={(clients ?? []) as ClientOption[]}
      warehouses={(warehouses ?? []) as WarehouseOption[]}
      products={(products ?? []) as ProductOption[]}
      locations={(locations ?? []) as LocationOption[]}
      initialReceipts={(receipts ?? []) as unknown as ReceiptRow[]}
    />
  );
}

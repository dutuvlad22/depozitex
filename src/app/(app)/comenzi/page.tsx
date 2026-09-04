import OrdersManager, {
  type ClientOption,
  type ProductOption,
  type OrderRow,
} from "@/components/orders-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function ComenziPage() {
  const { supabase, organizationId } = await requireOrgContext();

  const [{ data: clients }, { data: products }, { data: orders }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, sku, name, client_id")
      .eq("organization_id", organizationId)
      .order("sku", { ascending: true }),
    supabase
      .from("orders")
      .select(
        "id, order_no, status, created_at, clients(name), order_lines(id, quantity, products(sku, name)), shipments(awb, courier)"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <OrdersManager
      organizationId={organizationId}
      clients={(clients ?? []) as ClientOption[]}
      products={(products ?? []) as ProductOption[]}
      initialOrders={(orders ?? []) as unknown as OrderRow[]}
    />
  );
}

import ProductsManager, {
  type ClientOption,
  type ProductRow,
} from "@/components/products-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function ProdusePage() {
  const { supabase, organizationId } = await requireOrgContext();

  const [{ data: clients }, { data: products }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, sku, name, reorder_point, created_at, client_id, clients(name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ProductsManager
      organizationId={organizationId}
      clients={(clients ?? []) as ClientOption[]}
      initialProducts={(products ?? []) as unknown as ProductRow[]}
    />
  );
}

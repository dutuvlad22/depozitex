import { notFound } from "next/navigation";
import CartLabels from "@/components/cart-labels";
import { requireOrgContext } from "@/lib/org-context";

export default async function EtichetePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, organizationId } = await requireOrgContext();

  const { data: cart } = await supabase
    .from("carts")
    .select("code, capacity")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!cart) notFound();

  return <CartLabels code={cart.code} capacity={cart.capacity} />;
}

import CartsManager, { type CartRow } from "@/components/carts-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function CarucioarePage() {
  const { supabase, organizationId, isAdmin } = await requireOrgContext();

  if (!isAdmin) {
    return (
      <div className="stack">
        <div className="hint">Doar administratorii pot vedea aceasta pagina.</div>
      </div>
    );
  }

  const { data: carts } = await supabase
    .from("carts")
    .select(
      "id, code, capacity, active, cart_runs(id, status, started_at, picker:profiles!cart_runs_picker_id_fkey(email), cart_run_boxes(packed_at))"
    )
    .eq("organization_id", organizationId)
    .neq("cart_runs.status", "inchis")
    .order("code");

  return <CartsManager organizationId={organizationId} initialCarts={(carts ?? []) as unknown as CartRow[]} />;
}

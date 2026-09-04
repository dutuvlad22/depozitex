import ClientsManager, { type ClientRow } from "@/components/clients-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function ClientiPage() {
  const { supabase, organizationId, isAdmin } = await requireOrgContext();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return (
    <ClientsManager
      organizationId={organizationId}
      initialClients={(clients ?? []) as ClientRow[]}
      isAdmin={isAdmin}
    />
  );
}

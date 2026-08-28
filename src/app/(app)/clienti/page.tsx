import { redirect } from "next/navigation";
import ClientsManager, { type ClientRow } from "@/components/clients-manager";
import { createClient } from "@/lib/supabase/server";

export default async function ClientiPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // (app)/layout.tsx deja garanteaza ca exista un membership inainte sa
  // randeze pagina; verificarea de aici e doar o plasa de siguranta.
  if (!membership) {
    redirect("/");
  }

  const organizationId = membership.organization_id as string;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return (
    <ClientsManager
      organizationId={organizationId}
      initialClients={(clients ?? []) as ClientRow[]}
    />
  );
}

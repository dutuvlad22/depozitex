import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Helper pentru Server Components din grupul (app): confirma userul si
 * organizatia curenta (owner/membru). (app)/layout.tsx deja garanteaza ca
 * ambele exista inainte sa randeze pagina — verificarile de aici sunt o
 * plasa de siguranta suplimentara, nu logica principala.
 */
export async function requireOrgContext() {
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

  if (!membership) {
    redirect("/");
  }

  return {
    supabase,
    user,
    organizationId: membership.organization_id as string,
  };
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "operator" | "viewer";

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
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/");
  }

  const role = membership.role as OrgRole;

  return {
    supabase,
    user,
    organizationId: membership.organization_id as string,
    role,
    isAdmin: role === "owner" || role === "admin",
  };
}

/**
 * Varianta pentru Route Handlers: nu foloseste redirect() (nu are sens in
 * afara randarii de pagini), intoarce null daca userul nu e autentificat
 * sau nu are membership — apelantul decide ce raspuns HTTP trimite.
 */
export async function getOrgContext() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const role = membership.role as OrgRole;

  return {
    supabase,
    user,
    organizationId: membership.organization_id as string,
    role,
    isAdmin: role === "owner" || role === "admin",
  };
}

import { headers } from "next/headers";
import ApiDocs from "@/components/api-docs";
import ApiKeysManager, { type ApiKeyRow } from "@/components/api-keys-manager";
import { requireOrgContext } from "@/lib/org-context";

export default async function SetariApiPage() {
  const { supabase, organizationId, isAdmin } = await requireOrgContext();

  if (!isAdmin) {
    return (
      <div className="stack">
        <div className="hint">Doar administratorii pot vedea aceasta pagina.</div>
      </div>
    );
  }

  const [{ data: clients }, { data: keys }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", organizationId).order("name"),
    supabase
      .from("client_api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at, clients(name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  // adresa publica a aplicatiei, pentru exemplele din documentatie
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="stack">
      <ApiKeysManager clients={clients ?? []} keys={(keys ?? []) as unknown as ApiKeyRow[]} />
      <ApiDocs baseUrl={`${proto}://${host}`} />
    </div>
  );
}

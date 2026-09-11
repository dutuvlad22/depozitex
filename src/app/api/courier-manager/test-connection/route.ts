import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { createCourierManagerAdapter } from "@/lib/carriers/courier-manager";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Doar administratorii pot testa conexiunea." }, { status: 403 });
  }

  const { data: settings } = await ctx.supabase
    .from("courier_manager_settings")
    .select("base_url, api_key")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!settings?.api_key) {
    return NextResponse.json(
      { ok: false, message: "Contul Courier Manager nu este configurat inca." },
      { status: 400 }
    );
  }

  const adapter = createCourierManagerAdapter({
    baseUrl: settings.base_url,
    apiKey: settings.api_key,
  });
  const result = await adapter.testConnection();

  const message = result.ok
    ? `Conectat cu succes la ${result.companyName}.`
    : result.error;

  await ctx.supabase
    .from("courier_manager_settings")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_message: message,
    })
    .eq("organization_id", ctx.organizationId);

  return NextResponse.json({ ok: result.ok, message });
}

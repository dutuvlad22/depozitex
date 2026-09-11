import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org-context";

const DEFAULT_BASE_URL = "https://app.slm.team/slm/API";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Doar administratorii pot vedea aceste setari." }, { status: 403 });
  }

  const { data, error } = await ctx.supabase
    .from("courier_manager_settings")
    .select("base_url, api_key, is_active, last_test_at, last_test_ok, last_test_message")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cheia in sine nu iese niciodata din acest route handler — doar derivam
  // un boolean din prezenta ei.
  return NextResponse.json({
    configured: Boolean(data?.api_key),
    baseUrl: data?.base_url ?? DEFAULT_BASE_URL,
    isActive: data?.is_active ?? true,
    lastTestAt: data?.last_test_at ?? null,
    lastTestOk: data?.last_test_ok ?? null,
    lastTestMessage: data?.last_test_message ?? null,
  });
}

export async function POST(request: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  if (!ctx.isAdmin) {
    return NextResponse.json(
      { error: "Doar administratorii pot modifica setarile Courier Manager." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { baseUrl?: string; apiKey?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Cerere invalida." }, { status: 400 });
  }

  const baseUrl = (body.baseUrl ?? "").trim() || DEFAULT_BASE_URL;
  const apiKey = (body.apiKey ?? "").trim();

  const { data: existing } = await ctx.supabase
    .from("courier_manager_settings")
    .select("api_key")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!apiKey && !existing?.api_key) {
    return NextResponse.json({ error: "Cheia API este obligatorie." }, { status: 400 });
  }

  const { error } = await ctx.supabase.from("courier_manager_settings").upsert(
    {
      organization_id: ctx.organizationId,
      base_url: baseUrl,
      api_key: apiKey || (existing?.api_key as string),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

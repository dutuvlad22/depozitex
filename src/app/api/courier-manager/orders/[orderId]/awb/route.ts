import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { createCourierManagerAdapter, isCancelledStatus } from "@/lib/carriers/courier-manager";

const ORDER_SELECT =
  "id, status, recipient_name, recipient_phone, address_street, address_number, city, county, postal_code, country, weight_kg, parcels_count, cod_amount";

type OrderRow = {
  id: string;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  address_street: string | null;
  address_number: string | null;
  city: string | null;
  county: string | null;
  postal_code: string | null;
  country: string | null;
  weight_kg: number | null;
  parcels_count: number | null;
  cod_amount: number | null;
};

const REQUIRED_FIELDS: { key: keyof OrderRow; label: string }[] = [
  { key: "recipient_name", label: "Nume destinatar" },
  { key: "recipient_phone", label: "Telefon destinatar" },
  { key: "address_street", label: "Strada" },
  { key: "city", label: "Oras" },
  { key: "county", label: "Judet" },
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const { data: orderData } = await ctx.supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const order = orderData as OrderRow | null;
  if (!order) {
    return NextResponse.json({ error: "Comanda nu a fost gasita." }, { status: 404 });
  }

  const { data: shipment } = await ctx.supabase
    .from("shipments")
    .select("awb, status, error, updated_at")
    .eq("order_id", orderId)
    .maybeSingle();

  const { data: settings } = await ctx.supabase
    .from("courier_manager_settings")
    .select("base_url, api_key")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  let serviceTypes: { name: string; value: string }[] = [];
  if (settings?.api_key) {
    const adapter = createCourierManagerAdapter({
      baseUrl: settings.base_url,
      apiKey: settings.api_key,
    });
    serviceTypes = await adapter.listServiceTypes();
  }

  return NextResponse.json({
    order,
    shipment: shipment ?? null,
    serviceTypes,
    configured: Boolean(settings?.api_key),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { serviceType?: string } | null;
  const serviceType = body?.serviceType?.trim();
  if (!serviceType) {
    return NextResponse.json({ error: "Alege un tip de serviciu." }, { status: 400 });
  }

  const { data: orderData } = await ctx.supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const order = orderData as OrderRow | null;
  if (!order) {
    return NextResponse.json({ error: "Comanda nu a fost gasita." }, { status: 404 });
  }

  if (order.status !== "ambalat") {
    return NextResponse.json(
      { error: 'Comanda trebuie sa fie in statusul "Ambalat" pentru a genera AWB.' },
      { status: 409 }
    );
  }

  const missing = REQUIRED_FIELDS.filter((f) => !order[f.key]).map((f) => f.label);
  if (!order.weight_kg || Number(order.weight_kg) <= 0) missing.push("Greutate");
  if (!order.parcels_count || Number(order.parcels_count) <= 0) missing.push("Numar colete");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Date destinatar incomplete: ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const { data: existingShipment } = await ctx.supabase
    .from("shipments")
    .select("awb, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (existingShipment?.awb && !isCancelledStatus(existingShipment.status)) {
    return NextResponse.json(
      { error: `Exista deja un AWB activ (${existingShipment.awb}) pentru aceasta comanda.` },
      { status: 409 }
    );
  }

  const { data: settings } = await ctx.supabase
    .from("courier_manager_settings")
    .select("base_url, api_key")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!settings?.api_key) {
    return NextResponse.json({ error: "Contul Courier Manager nu este configurat." }, { status: 400 });
  }

  const adapter = createCourierManagerAdapter({
    baseUrl: settings.base_url,
    apiKey: settings.api_key,
  });

  const result = await adapter.createShipment(serviceType, {
    to: {
      name: order.recipient_name!,
      phone: order.recipient_phone!,
      street: order.address_street!,
      number: order.address_number ?? undefined,
      city: order.city!,
      county: order.county!,
      postalCode: order.postal_code ?? undefined,
      country: order.country ?? "RO",
    },
    weightKg: Number(order.weight_kg),
    parcelsCount: Number(order.parcels_count),
    codAmount: order.cod_amount ? Number(order.cod_amount) : null,
    customerReference: order.id,
  });

  if (!result.ok) {
    // Nu suprascriem un AWB anterior (ex. unul anulat) cu null — doar
    // inregistram eroarea, pastrand istoricul randului daca exista deja.
    const { data: updated } = await ctx.supabase
      .from("shipments")
      .update({
        error: result.error,
        raw_response: result.raw as object,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .select("id")
      .maybeSingle();

    if (!updated) {
      await ctx.supabase.from("shipments").insert({
        organization_id: ctx.organizationId,
        order_id: orderId,
        awb: null,
        courier: "courier_manager",
        status: "eroare",
        error: result.error,
        raw_response: result.raw as object,
        created_by: ctx.user.id,
      });
    }

    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const { data: shipment, error: rpcError } = await ctx.supabase.rpc("courier_record_shipment", {
    p_order_id: orderId,
    p_awb: result.awb,
    p_status: result.status,
    p_raw_response: result.raw as object,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shipment });
}

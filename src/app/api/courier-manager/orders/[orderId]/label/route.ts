import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { createCourierManagerAdapter } from "@/lib/carriers/courier-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const { data: order } = await ctx.supabase
    .from("orders")
    .select("id, order_no")
    .eq("id", orderId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Comanda nu a fost gasita." }, { status: 404 });
  }

  const { data: shipment } = await ctx.supabase
    .from("shipments")
    .select("awb")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!shipment?.awb) {
    return NextResponse.json({ error: "Comanda nu are inca un AWB." }, { status: 400 });
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
  const result = await adapter.getLabel(shipment.awb);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return new NextResponse(result.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="eticheta-${order.order_no}.pdf"`,
    },
  });
}

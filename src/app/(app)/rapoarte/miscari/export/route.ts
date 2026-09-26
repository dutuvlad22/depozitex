import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { csvResponse, formatDateTime, toCsv } from "@/lib/reports/csv";
import { MOVEMENT_TYPES, getAllMovements } from "@/lib/reports/data";
import { searchParamsOf } from "@/lib/reports/format";
import { param, resolvePeriod } from "@/lib/reports/period";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.key, t.label]));

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const sp = searchParamsOf(request.nextUrl);
  const period = resolvePeriod(sp);
  const type = param(sp, "tip");
  const rows = await getAllMovements(ctx.supabase, ctx.organizationId, {
    period,
    clientId: param(sp, "client") || null,
    type: MOVEMENT_TYPES.some((t) => t.key === type) ? type : null,
    search: param(sp, "cauta"),
  });

  const csv = toCsv(
    ["Data", "Tip", "SKU", "Produs", "Client", "Depozit", "Locatie", "Cantitate", "Referinta", "Utilizator"],
    rows.map((m) => [
      formatDateTime(m.created_at),
      TYPE_LABEL[m.movement_type] ?? m.movement_type,
      m.sku,
      m.product_name,
      m.client_name,
      m.warehouse_name,
      m.location_code,
      m.quantity_change,
      m.reference_label,
      m.created_by_email,
    ])
  );
  return csvResponse(`miscari-stoc_${period.from}_${period.to}.csv`, csv);
}

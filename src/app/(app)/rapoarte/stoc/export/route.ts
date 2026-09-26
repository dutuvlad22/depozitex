import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { csvResponse, formatDateTime, toCsv } from "@/lib/reports/csv";
import { getStock } from "@/lib/reports/data";
import { searchParamsOf } from "@/lib/reports/format";
import { param, todayRo } from "@/lib/reports/period";

const STATUS_LABEL: Record<string, string> = { ok: "OK", scazut: "Sub prag", epuizat: "Epuizat" };

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const sp = searchParamsOf(request.nextUrl);
  const rows = await getStock(ctx.supabase, ctx.organizationId, param(sp, "client") || null, param(sp, "filtru"));

  const csv = toCsv(
    ["Client", "SKU", "Produs", "Stoc", "Prag", "Locatii", "Ultima miscare", "Status"],
    rows.map((r) => [
      r.client_name,
      r.sku,
      r.product_name,
      r.quantity,
      r.reorder_point,
      r.locations,
      formatDateTime(r.last_movement_at),
      STATUS_LABEL[r.status],
    ])
  );
  return csvResponse(`stoc_${todayRo()}.csv`, csv);
}

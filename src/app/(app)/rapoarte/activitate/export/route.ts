import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { getClientActivity } from "@/lib/reports/data";
import { searchParamsOf } from "@/lib/reports/format";
import { resolvePeriod } from "@/lib/reports/period";

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const period = resolvePeriod(searchParamsOf(request.nextUrl));
  const rows = await getClientActivity(ctx.supabase, ctx.organizationId, period);

  const csv = toCsv(
    [
      "Client",
      "Comenzi primite",
      "Comenzi expediate",
      "Bucati expediate",
      "Receptii",
      "Bucati receptionate",
      "Retururi",
      "Bucati returnate",
      "Stoc la final (buc.)",
    ],
    rows.map((r) => [
      r.client_name,
      r.orders_received,
      r.orders_shipped,
      r.units_shipped,
      r.receipts_count,
      r.units_received,
      r.returns_count,
      r.units_returned,
      r.units_in_stock,
    ])
  );
  return csvResponse(`activitate-clienti_${period.from}_${period.to}.csv`, csv);
}

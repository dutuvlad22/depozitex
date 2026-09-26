import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org-context";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { getPerformance } from "@/lib/reports/data";
import { searchParamsOf } from "@/lib/reports/format";
import { resolvePeriod } from "@/lib/reports/period";

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const period = resolvePeriod(searchParamsOf(request.nextUrl));
  const { days } = await getPerformance(ctx.supabase, ctx.organizationId, period);

  const csv = toCsv(
    ["Ziua", "Comenzi primite", "Comenzi expediate", "Bucati expediate", "Timp mediu pana la expediere (ore)"],
    days.map((d) => [d.day, d.orders_received, d.orders_shipped, d.units_shipped, d.avg_hours_to_ship])
  );
  return csvResponse(`performanta_${period.from}_${period.to}.csv`, csv);
}

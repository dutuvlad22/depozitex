import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FINAL_STATUSES, createCourierManagerAdapter } from "@/lib/carriers/courier-manager";

// Apelata de timer-ul systemd de pe server (ops/depozitex-cm-status.*), nu de
// browser. Ruleaza fara sesiune, deci foloseste clientul service role si se
// protejeaza singura cu CRON_SECRET (middleware-ul o lasa sa treaca).

const BATCH_SIZE = 50;
const MAX_PER_ORG = 500;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET nu este setat." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const summary = { organizations: 0, checked: 0, changed: 0, notFound: 0, failedBatches: 0 };

  const { data: settingsRows, error: settingsError } = await supabase
    .from("courier_manager_settings")
    .select("organization_id, base_url, api_key")
    .eq("is_active", true);
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  for (const settings of settingsRows ?? []) {
    summary.organizations++;
    const adapter = createCourierManagerAdapter({
      baseUrl: settings.base_url,
      apiKey: settings.api_key,
    });

    const { data: shipments } = await supabase
      .from("shipments")
      .select("id, awb, status")
      .eq("organization_id", settings.organization_id)
      .eq("courier", "courier_manager")
      .not("awb", "is", null)
      .not("status", "in", `(${[...FINAL_STATUSES].join(",")})`)
      .order("status_checked_at", { ascending: true, nullsFirst: true })
      .limit(MAX_PER_ORG);

    const rows = (shipments ?? []) as { id: string; awb: string; status: string }[];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const result = await adapter.getStatuses(batch.map((s) => s.awb));
      if (!result.ok) {
        summary.failedBatches++;
        continue;
      }

      const now = new Date().toISOString();
      for (const shipment of batch) {
        summary.checked++;
        const found = result.results[shipment.awb];

        if (!found) {
          summary.notFound++;
          await supabase
            .from("shipments")
            .update({ status_checked_at: now, error: "AWB-ul nu a fost gasit in Courier Manager." })
            .eq("id", shipment.id);
          continue;
        }

        const changed = found.status !== shipment.status;
        if (changed) summary.changed++;
        await supabase
          .from("shipments")
          .update({
            status: found.status,
            raw_response: found.raw as object,
            error: null,
            status_checked_at: now,
            ...(changed ? { updated_at: now } : {}),
          })
          .eq("id", shipment.id);
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

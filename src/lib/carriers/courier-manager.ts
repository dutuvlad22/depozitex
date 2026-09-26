// Adaptor pentru Courier Manager (app.slm.team). Foloseste doar server-side
// (route handlers) — cheia API nu trebuie sa ajunga niciodata intr-un
// Client Component sau intr-un raspuns catre browser.
//
// Documentatie: https://app.slm.team/slm/Main?apiDocs=true
// - Autentificare: parametru `api_key` (form-encoded), nu header/Basic auth.
// - Request-uri: application/x-www-form-urlencoded, nu JSON.
// - Raspuns standard: { status: "done"|"failed", data, error, message }.
//   Exceptie: list_services raspunde direct cu un array, fara acest plic.

import type {
  CarrierAdapter,
  CreateShipmentInput,
  CreateShipmentResult,
  LabelResult,
  ServiceType,
  ShipmentStatusesResult,
  ShipmentStatusResult,
  TestConnectionResult,
} from "./types";

export type CmCredentials = { baseUrl: string; apiKey: string };

// Statusurile vin in engleza sau in limba contului (contul DepoziteX foloseste
// romana: initial, neridicat, in_curs, avizat, livrat, returnat, anulat, exceptie).
const CANCELLED_STATUSES = new Set(["canceled", "cancelled", "anulat"]);
export const FINAL_STATUSES = new Set([
  ...CANCELLED_STATUSES,
  "delivered",
  "livrat",
  "returned",
  "returnat",
]);

export function isCancelledStatus(status: string | null | undefined) {
  if (!status) return false;
  return CANCELLED_STATUSES.has(status.toLowerCase());
}

type CmStatusEntry = {
  no?: string;
  request_no?: string;
  status?: string;
  code?: string;
  code_name?: string;
  date?: number;
};

type CmEnvelope = {
  ok: boolean;
  data: unknown;
  error?: string;
  message?: string;
  raw: unknown;
};

async function callCm(
  creds: CmCredentials,
  operation: string,
  params: Record<string, string | number | boolean | undefined | null>
): Promise<CmEnvelope> {
  const body = new URLSearchParams();
  body.set("api_key", creds.apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    return {
      ok: false,
      data: null,
      error: "network_error",
      message: "Nu am putut contacta Courier Manager. Verifica URL-ul de baza si conexiunea.",
      raw: null,
    };
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      data: null,
      error: "invalid_response",
      message: "Raspuns neasteptat de la Courier Manager.",
      raw: text,
    };
  }

  if (json && typeof json === "object" && "status" in json) {
    const envelope = json as { status: string; data?: unknown; error?: string; message?: string };
    return {
      ok: envelope.status === "done",
      data: envelope.data,
      error: envelope.error,
      message: envelope.message,
      raw: json,
    };
  }

  // list_services (si posibil altele) raspund direct cu date brute.
  return { ok: true, data: json, raw: json };
}

export function createCourierManagerAdapter(creds: CmCredentials): CarrierAdapter {
  return {
    async testConnection(): Promise<TestConnectionResult> {
      const res = await callCm(creds, "test_connection", {});
      if (!res.ok) {
        return { ok: false, error: res.message ?? "Conexiune esuata la Courier Manager." };
      }
      const data = res.data as { account_name?: string; usercompany_name?: string } | undefined;
      return {
        ok: true,
        accountName: data?.account_name ?? "—",
        companyName: data?.usercompany_name ?? "—",
      };
    },

    async listServiceTypes(): Promise<ServiceType[]> {
      const res = await callCm(creds, "list_services", { type: "main" });
      if (!res.ok || !Array.isArray(res.data)) return [];
      return res.data as ServiceType[];
    },

    async createShipment(
      serviceType: string,
      input: CreateShipmentInput
    ): Promise<CreateShipmentResult> {
      const res = await callCm(creds, "create_shipment", {
        type: "package",
        service_type: serviceType,
        payer: "client",
        cnt: input.parcelsCount,
        weight: input.weightKg,
        customer_reference: input.customerReference,
        to_name: input.to.name,
        to_phone: input.to.phone,
        to_str: input.to.street,
        to_nr: input.to.number,
        to_city: input.to.city,
        to_county: input.to.county,
        to_zipcode: input.to.postalCode,
        to_country: input.to.country,
        ...(input.codAmount ? { ramburs: input.codAmount, ramburs_type: "cont" } : {}),
      });

      if (!res.ok) {
        return {
          ok: false,
          error: res.message ?? "Cererea catre Courier Manager a esuat.",
          raw: res.raw,
        };
      }

      const data = res.data as { no?: string; status?: string } | undefined;
      if (!data?.no) {
        return { ok: false, error: "Raspuns fara numar de AWB.", raw: res.raw };
      }

      return { ok: true, awb: data.no, status: data.status ?? "uncollected", raw: res.raw };
    },

    async getStatus(awb: string): Promise<ShipmentStatusResult> {
      const res = await callCm(creds, "get_status", { awbno: awb });
      if (!res.ok) {
        return { ok: false, error: res.message ?? "Nu am putut prelua statusul.", raw: res.raw };
      }
      const data = res.data as CmStatusEntry | undefined;
      // Un AWB inexistent vine tot cu status "done", dar cu `no` gol.
      if (!data?.no) {
        return { ok: false, error: "AWB-ul nu a fost gasit in Courier Manager.", raw: res.raw };
      }
      return { ok: true, status: data.status || "necunoscut", raw: data };
    },

    async getStatuses(awbs: string[]): Promise<ShipmentStatusesResult> {
      const res = await callCm(creds, "get_status", { awbnos: awbs.join(",") });
      if (!res.ok) {
        return { ok: false, error: res.message ?? "Nu am putut prelua statusurile." };
      }

      // Cu `awbnos`, `data` e o lista; normalizam si cazul unui singur obiect.
      const entries = (Array.isArray(res.data) ? res.data : [res.data]) as CmStatusEntry[];
      const results: Record<string, { status: string; raw: unknown }> = {};
      for (const entry of entries) {
        // `request_no` e numarul cerut; `no` e gol cand AWB-ul nu exista.
        if (entry?.request_no && entry.no) {
          results[entry.request_no] = { status: entry.status || "necunoscut", raw: entry };
        }
      }
      return { ok: true, results };
    },

    async getLabel(awb: string): Promise<LabelResult> {
      const body = new URLSearchParams();
      body.set("api_key", creds.apiKey);
      body.set("awbno", awb);
      body.set("type", "pdf");
      body.set("format", "a6");

      let res: Response;
      try {
        res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
      } catch {
        return { ok: false, error: "Nu am putut contacta Courier Manager pentru eticheta." };
      }

      if (!res.ok) {
        return { ok: false, error: "Nu am putut descarca eticheta." };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("pdf")) {
        // Probabil un raspuns de eroare in format JSON, nu PDF-ul asteptat.
        const text = await res.text();
        try {
          const json = JSON.parse(text) as { message?: string };
          return { ok: false, error: json.message ?? "Eticheta nu este disponibila." };
        } catch {
          return { ok: false, error: "Eticheta nu este disponibila." };
        }
      }

      return { ok: true, contentType, bytes: await res.arrayBuffer() };
    },
  };
}

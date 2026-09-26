import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// API-ul public pentru clienti (/api/v1/*). Autorizarea cheii si accesul la
// date se fac in functiile SQL api_* (sql/12_api-clienti.sql), apelate cu
// cheia publica (anon): ruta nu are nevoie de cheia service role.

const MAX_BODY_BYTES = 256 * 1024;

const STATUS_BY_CODE: Record<string, number> = {
  unauthorized: 401,
  invalid: 400,
  unknown_sku: 422,
  not_found: 404,
};

type ApiResult = { ok: boolean; code?: string; error?: string; created?: boolean; [key: string]: unknown };

export function apiClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cheia din `Authorization: Bearer dx_...` sau `X-API-Key: dx_...`. */
export function apiKeyFrom(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? request.headers.get("x-api-key")?.trim() ?? null;
}

export function apiError(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export const missingKey = () =>
  apiError(401, "unauthorized", "Lipseste cheia API (antetul Authorization: Bearer <cheie>).");

/** Raspunsul unei functii api_* -> JSON cu codul HTTP potrivit. */
export function apiRespond(
  result: { data: unknown; error: { message: string } | null },
  successStatus = 200
) {
  if (result.error) {
    console.error("api/v1:", result.error.message);
    return apiError(500, "server_error", "Eroare interna. Incearca din nou.");
  }
  const body = result.data as ApiResult;
  if (!body.ok) {
    return NextResponse.json(body, { status: STATUS_BY_CODE[body.code ?? ""] ?? 400 });
  }
  return NextResponse.json(body, { status: successStatus });
}

/** Corpul JSON al cererii, cu limita de marime. */
export async function readJson(request: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "too_large", "Cererea depaseste 256 KB.") };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError(400, "invalid", "Corpul cererii nu este JSON valid.") };
  }
}

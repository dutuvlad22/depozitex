import type { NextRequest } from "next/server";
import { apiClient, apiKeyFrom, apiRespond, missingKey, readJson } from "@/lib/api/v1";

/** POST /api/v1/comenzi — clientul trimite o comanda noua (idempotent dupa numar_comanda). */
export async function POST(request: NextRequest) {
  const key = apiKeyFrom(request);
  if (!key) return missingKey();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const result = await apiClient().rpc("api_create_order", { p_api_key: key, p_order: body.value });
  const created = (result.data as { created?: boolean } | null)?.created;
  return apiRespond(result, created ? 201 : 200);
}

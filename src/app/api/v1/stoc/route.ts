import type { NextRequest } from "next/server";
import { apiClient, apiKeyFrom, apiRespond, missingKey } from "@/lib/api/v1";

/** GET /api/v1/stoc — stocul curent al produselor clientului. */
export async function GET(request: NextRequest) {
  const key = apiKeyFrom(request);
  if (!key) return missingKey();

  return apiRespond(await apiClient().rpc("api_get_stock", { p_api_key: key }));
}

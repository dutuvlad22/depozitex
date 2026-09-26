import type { NextRequest } from "next/server";
import { apiClient, apiKeyFrom, apiRespond, missingKey } from "@/lib/api/v1";

/** GET /api/v1/comenzi/{numar} — statusul unei comenzi a clientului (inclusiv AWB). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ numar: string }> }) {
  const key = apiKeyFrom(request);
  if (!key) return missingKey();

  const { numar } = await params;
  return apiRespond(await apiClient().rpc("api_get_order", { p_api_key: key, p_order_no: numar }));
}

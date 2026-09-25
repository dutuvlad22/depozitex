import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Redirect relativ: in spatele lui Caddy, URL-urile absolute construite de Next
// ar folosi adresa interna (localhost:3000) in loc de domeniul public.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

/**
 * Destinatia linkurilor din emailuri (sablonul de pe server trimite aici
 * token_hash + type). Verifica tokenul, creeaza sesiunea (cookie) si trimite
 * userul la `next`. Spre deosebire de /auth/callback (PKCE), merge in orice
 * browser, nu doar in cel care a cerut emailul.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");
  // doar cai interne, ca linkul sa nu poata redirectiona pe alt site ("//x", "/\x")
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return redirectTo(safeNext);
    }
  }

  return redirectTo("/login?error=link");
}

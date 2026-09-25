import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Redirect relativ: in spatele lui Caddy, URL-urile absolute construite de Next
// ar folosi adresa interna (localhost:3000) in loc de domeniul public.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

/**
 * Destinatia linkurilor din emailurile Supabase (ex. resetare parola).
 * Schimba codul primit pe o sesiune (cookie) si trimite userul la `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // doar cai interne, ca linkul sa nu poata redirectiona pe alt site ("//x", "/\x")
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectTo(safeNext);
    }
  }

  return redirectTo("/login?error=link");
}

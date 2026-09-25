import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destinatia linkurilor din emailurile Supabase (ex. resetare parola).
 * Schimba codul primit pe o sesiune (cookie) si trimite userul la `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // doar cai interne, ca linkul sa nu poata redirectiona pe alt site
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  // nextUrl (nu request.url) pastreaza domeniul public cand rulam in spatele lui Caddy
  const url = request.nextUrl.clone();
  url.search = "";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = safeNext;
      return NextResponse.redirect(url);
    }
  }

  url.pathname = "/login";
  url.searchParams.set("error", "link");
  return NextResponse.redirect(url);
}

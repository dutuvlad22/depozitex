import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase pentru Server Components, Server Actions si Route Handlers.
 * Foloseste cookie-urile request-ului curent pentru a pastra sesiunea userului
 * (auth) intre client si server. A se apela din interiorul unei functii async
 * a unui Server Component / Server Action / Route Handler.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll a fost apelat dintr-un Server Component.
            // Poate fi ignorat daca exista middleware care reimprospateaza sesiunea.
          }
        },
      },
    }
  );
}

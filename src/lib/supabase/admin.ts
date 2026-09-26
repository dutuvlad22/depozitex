import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase cu cheia service role: ocoleste RLS. Se foloseste DOAR din
 * route handlers care ruleaza fara sesiune de utilizator (joburi programate)
 * si care isi fac singure autorizarea. Nu se importa niciodata dintr-un
 * Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nu este setat.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

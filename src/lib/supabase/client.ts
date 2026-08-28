import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase pentru Client Components ("use client").
 * Foloseste cheia publica (anon) — sigura de expus in browser, protectia
 * datelor se face prin Row Level Security (RLS) in Supabase.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

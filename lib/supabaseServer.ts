// lib/supabaseServer.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Uses your middleware cookie bridge. No refresh/set here (middleware handles it). */
export function getServerSupabase() {
  const c = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return c.get(name)?.value;
        },
        set() { /* no-op; middleware writes */ },
        remove() { /* no-op */ },
      },
      global: {
        headers: {
          "X-Forwarded-For": headers().get("x-forwarded-for") ?? "",
          "X-Client-Info": "nfa-ssr",
        },
      },
    }
  );
}

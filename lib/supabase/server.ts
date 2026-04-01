// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server Component / RSC-safe Supabase client.
 * - Uses Next.js cookies() bridge (non-negotiable).
 * - In RSC, cookies are read-only in Next 14.2+, so set/remove are NO-OPs here.
 * - Middleware / Route Handlers should do the real cookie refresh.
 */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // No-ops in Server Components; real setting happens in middleware/route handlers.
        set() {},
        remove() {},
      },
    }
  );
}

/** Back-compat alias — some files may still import this name */
export const createSupabaseServer = createServerSupabase;

// Default export for convenience
export default createServerSupabase;

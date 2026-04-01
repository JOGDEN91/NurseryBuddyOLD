// lib/admin.ts
import { cookies as nextCookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

type CookieOptions = {
  path?: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  expires?: Date | string;
};

const isServer = typeof window === "undefined";

/* ------------------------------------------------------------------ */
/* Client-safe cookie helper (writes via API route)                    */
/* ------------------------------------------------------------------ */
async function postToCookieRoute(body: Record<string, any>) {
  await fetch("/api/utils/cookies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
}

export const cookieStore = {
  get(name: string): string | undefined {
    if (isServer) {
      try {
        return nextCookies().get(name)?.value;
      } catch {
        return undefined;
      }
    }
    if (typeof document !== "undefined") {
      const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
      return m ? decodeURIComponent(m[2]) : undefined;
    }
    return undefined;
  },
  async set(name: string, value: string, options?: CookieOptions) {
    if (isServer) {
      try {
        // Only legal in Server Action / Route Handler. If it throws, fall back:
        nextCookies().set(name, value, options as any);
        return;
      } catch {}
    }
    await postToCookieRoute({ name, value, options });
  },
  async remove(name: string, options?: CookieOptions) {
    if (isServer) {
      try {
        nextCookies().set(name, "", { ...(options as any), maxAge: 0 });
        return;
      } catch {}
    }
    await postToCookieRoute({ name, remove: true, options });
  },
};

/* ------------------------------------------------------------------ */
/* Server-only Supabase client with cookies() bridge                   */
/* ------------------------------------------------------------------ */
export function getServerSupabase() {
  const jar = nextCookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Next 14: mutation only allowed in Server Actions / Route Handlers.
          // Wrap to avoid hard crashes in plain RSC contexts.
          try {
            jar.set(name, value, options as any);
          } catch {
            /* no-op: middleware refresh still upholds your invariant */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            jar.set(name, "", { ...(options as any), maxAge: 0 });
          } catch {
            /* no-op */
          }
        },
      },
    }
  );
  return supabase;
}

/* ------------------------------------------------------------------ */
/* requireAdmin(): server guard used by admin pages                    */
/* - Uses @supabase/ssr + cookies() bridge (your invariant)           */
/* - Case-insensitive super_admin gate                                */
/* - Never accesses user!.id without guard                            */
/* ------------------------------------------------------------------ */
export async function requireAdmin() {
  const supabase = getServerSupabase();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  if (!user) {
    // Keep it simple; if you want a redirect back param, add it here.
    redirect("/admin/sign-in");
  }

  // Prefer RPC helper if present (v2 we created); fall back to role_grants read.
  let isAdmin = false;

  try {
    const { data: rpcOk } = await supabase.rpc("auth_has_role_ci_v2", { p_role: "super_admin" });
    if (rpcOk === true) isAdmin = true;
  } catch {
    // ignore; try fallback
  }

  if (!isAdmin) {
    const { data: grants, error } = await supabase
      .from("role_grants")
      .select("role")
      .eq("user_id", user.id);
    if (!error && Array.isArray(grants)) {
      isAdmin = grants.some((g: any) => String(g.role || "").toLowerCase() === "super_admin");
    }
  }

  if (!isAdmin) {
    redirect("/admin/access"); // or a dedicated 403 page
  }

  return { supabase, user };
}

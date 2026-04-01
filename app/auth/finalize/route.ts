// app/auth/finalize/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Accepts ?access_token=...&refresh_token=...&next=/path[&debug=1]
 * Writes Supabase auth cookies via setSession using @supabase/ssr (explicit URL/key),
 * then either redirects to `next` or returns JSON diagnostics if debug=1.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const access_token = url.searchParams.get("access_token") || "";
  const refresh_token = url.searchParams.get("refresh_token") || "";
  const next = url.searchParams.get("next") || "/";
  const debug = url.searchParams.get("debug") === "1";

  const cookieStore = cookies();

  // Build a server client with explicit env + explicit cookie bridges
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set(name, value, options as any);
        },
        remove(name, options) {
          cookieStore.set(name, "", { ...options, maxAge: 0 } as any);
        },
      },
    }
  );

  let result: any = { action: "set_session" };
  if (!access_token || !refresh_token) {
    result = {
      action: "missing_tokens",
      access_len: access_token.length,
      refresh_len: refresh_token.length,
    };
  } else {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      result = { action: "set_session", ok: false, error: String(error.message ?? error) };
    } else {
      result = { action: "set_session", ok: true };
    }
  }

  // Immediately fetch the user using the same client/cookie bridge
  const { data: { user }, error: getUserErr } = await supabase.auth.getUser();

  if (debug) {
    const names = cookies().getAll().map((c) => c.name);
    return NextResponse.json({
      ok: result.ok ?? false,
      step: result.action,
      error: result.error ?? null,
      user,
      getUserErr: getUserErr ? String(getUserErr.message ?? getUserErr) : null,
      cookieNames: names,
      projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      note: "If user is present here, cookies are set for this response. If subsequent requests don't see them, it's a browser/domain/cookie-scope issue.",
    });
  }

  // Normal flow: redirect to the target with a tiny status cookie
  const res = NextResponse.redirect(new URL(next, url));
  res.cookies.set("sb-auth", result.ok ? "set_ok" : "set_failed", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}

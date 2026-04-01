// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    // ignore
  }

  // Signed-out: clear cookies
  if (payload?.event === "SIGNED_OUT") {
    const { error } = await supabase.auth.signOut();
    const res = NextResponse.json({ ok: !error, action: "signed_out", error });
    res.cookies.set("sb-auth", "signed_out", { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  }

  // Signed-in / token refreshed: write cookies from session
  if ((payload?.event === "SIGNED_IN" || payload?.event === "TOKEN_REFRESHED")) {
    const sess = payload?.session;
    const access_token = sess?.access_token;
    const refresh_token = sess?.refresh_token;

    if (!access_token || !refresh_token) {
      // fallback: try to touch current session (rarely helps on first sign-in)
      await supabase.auth.getSession();
      const res = NextResponse.json({
        ok: false,
        action: "missing_tokens",
        note: "No access/refresh token found in payload",
      });
      res.cookies.set("sb-auth", "missing_tokens", { path: "/", httpOnly: true, sameSite: "lax" });
      return res;
    }

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    const res = NextResponse.json({ ok: !error, action: "set_session", error: error ?? null });
    res.cookies.set("sb-auth", error ? "set_failed" : "set_ok", { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  }

  // Unknown event: just touch session
  await supabase.auth.getSession();
  const res = NextResponse.json({ ok: true, action: "touched" });
  res.cookies.set("sb-auth", "touched", { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}

// Optional GET for manual probing
export const GET = POST;

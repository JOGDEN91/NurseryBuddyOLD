// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

function is(pathname: string, prefix: string) {
  return pathname.toLowerCase().startsWith(prefix.toLowerCase());
}

function buildRedirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
  url.search = url.searchParams.toString();
  return url;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Bypass /auth/*
  if (is(pathname, "/auth/")) {
    return NextResponse.next();
  }

  // 2) Prepare a response we can mutate cookies on
  const res = NextResponse.next();

  // 3) Supabase middleware client (the correct helper for middleware)
  const supabase = createMiddlewareClient({ req, res });

  // 4) Touch session on every non-auth request (refresh cookies if needed)
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // 5) Never redirect /api/* (but cookies have been refreshed above)
  if (is(pathname, "/api/")) {
    return res;
  }

  // 6) /org/* requires signed-in user
  if (is(pathname, "/org/") && !user) {
    return NextResponse.redirect(buildRedirect(req, "/auth/sign-in"));
  }

  // 7) /admin/* requires super_admin (case-insensitive via your RPC)
  if (is(pathname, "/admin/")) {
    if (!user) {
      return NextResponse.redirect(buildRedirect(req, "/auth/sign-in"));
    }
    const { data: hasRole, error } = await supabase.rpc("auth_has_role_ci_uid", {
      target: "super_admin",
      p_user: null, // function will use auth.uid()
    });
    if (error || !hasRole) {
      const url = req.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.rewrite(url); // keep URL; show 403 content
    }
  }

  // 8) Pass through (with possibly refreshed cookies)
  return res;
}

// 9) Match everything except Next internals & assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

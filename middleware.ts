// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Invariants:
 * - Bypass /auth/* and public assets
 * - Never redirect /api/*
 * - Case-insensitive role gate
 * - Refresh Supabase cookies on every non-auth request
 */

const PUBLIC_PATHS: RegExp[] = [
  /^\/auth(?:\/|$)/,
  /^\/admin\/sign-in$/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/static\//,
];

const STATIC_EXT = /\.(?:js|css|png|jpg|jpeg|svg|gif|ico|webp|txt|map)$/i;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never intercept API routes
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Public + static passthrough
  if (PUBLIC_PATHS.some((re) => re.test(pathname)) || STATIC_EXT.test(pathname)) {
    return NextResponse.next();
  }

  // Mutable response so Supabase can refresh cookies
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Helper: collect roles from metadata + role_grants (case-insensitive)
  const getRoles = async (): Promise<Set<string>> => {
    const s = new Set<string>();
    const meta = (user?.user_metadata?.role as string | undefined)?.toLowerCase();
    const top  = ((user as any)?.role as string | undefined)?.toLowerCase();
    if (meta) s.add(meta);
    if (top) s.add(top);

    if (user?.id) {
      const { data: grants } = await supabase
        .from("role_grants")
        .select("role")
        .eq("user_id", user.id);
      for (const g of grants ?? []) {
        const r = String(g.role ?? "").toLowerCase();
        if (r) s.add(r);
      }
    }
    return s;
  };

  // Role groups (tolerant to naming variants)
  const isSuper = (rs: Set<string>) => rs.has("super_admin");
  const isOrg   = (rs: Set<string>) =>
    rs.has("org_admin") || rs.has("organisation_admin") || rs.has("manager") || rs.has("owner");
  const isStaff = (rs: Set<string>) =>
    rs.has("staff") || rs.has("nursery_staff");

  // ── Admin area gate (unchanged behaviour)
  if (pathname.startsWith("/admin")) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/sign-in";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    const roles = await getRoles();
    if (!(isSuper(roles))) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/choose";
      url.searchParams.set("reason", "forbidden");
      return NextResponse.redirect(url);
    }
    return res;
  }

  // If user is not signed in and hitting protected org/staff pages, send to choose
  const needsAuth = pathname.startsWith("/org") || pathname.startsWith("/staff");
  if (needsAuth && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/choose";
    url.searchParams.set("reason", "signin");
    return NextResponse.redirect(url);
  }

  if (user) {
    const roles = await getRoles();

    // ── Org area: only ORG roles or SUPER_ADMIN.
    if (pathname.startsWith("/org")) {
      if (isSuper(roles) || isOrg(roles)) {
        return res;
      }
      // Staff trying to view /org → push them to staff home
      if (isStaff(roles)) {
        const url = req.nextUrl.clone();
        url.pathname = "/staff/overview";
        return NextResponse.redirect(url);
      }
      // Unknown role → choose
      const url = req.nextUrl.clone();
      url.pathname = "/auth/choose";
      url.searchParams.set("reason", "forbidden");
      return NextResponse.redirect(url);
    }

    // ── Staff area: only STAFF or SUPER_ADMIN.
    if (pathname.startsWith("/staff")) {
      if (isSuper(roles) || isStaff(roles)) {
        return res;
      }
      // Org admin trying to view /staff → push them to org home
      if (isOrg(roles)) {
        const url = req.nextUrl.clone();
        url.pathname = "/org/nursery/overview";
        return NextResponse.redirect(url);
      }
      const url = req.nextUrl.clone();
      url.pathname = "/auth/choose";
      url.searchParams.set("reason", "forbidden");
      return NextResponse.redirect(url);
    }

    // Optional convenience: if a signed-in user lands on / or /auth/choose,
    // route them to the correct home area.
    if (pathname === "/" || pathname === "/auth/choose") {
      const url = req.nextUrl.clone();
      if (isSuper(roles) || isOrg(roles)) {
        url.pathname = "/org/nursery/overview";
      } else if (isStaff(roles)) {
        url.pathname = "/staff/overview";
      } else {
        // unknown role: stay on choose
        return res;
      }
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  // match everything except static assets
  matcher: ["/((?!_next|.*\\.(?:js|css|png|jpg|jpeg|svg|gif|ico|webp|txt|map)$).*)"],
};

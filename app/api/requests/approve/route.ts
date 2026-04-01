import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (name: string) => jar.get(name)?.value,
    set: (name: string, value: string, options?: any) =>
      jar.set({ name, value, ...options }),
    remove: (name: string, options?: any) =>
      jar.set({ name, value: "", ...options, maxAge: 0 }),
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const requestId = formData.get("request_id") as string | null;

    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "Missing request_id" },
        { status: 400 }
      );
    }

    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load request + nursery to check permissions
    const { data: reqRow, error: reqErr } = await admin
      .from("change_requests")
      .select(
        `
        id,
        status,
        nursery_id,
        type
      `
      )
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr || !reqRow) {
      return NextResponse.redirect(new URL("/staff/requests", req.url));
    }

    const nurseryId = reqRow.nursery_id as string | null;
    if (!nurseryId) {
      return NextResponse.redirect(new URL("/staff/requests", req.url));
    }

    // Is this user an ORG_ADMIN for the nursery's org?
    const { data: nursery, error: nurseryErr } = await admin
      .from("nurseries")
      .select("organisation_id")
      .eq("id", nurseryId)
      .maybeSingle();

    if (nurseryErr || !nursery) {
      return NextResponse.redirect(new URL("/staff/requests", req.url));
    }

    const { data: grants } = await admin
      .from("role_grants")
      .select("org_id, role")
      .eq("user_id", user.id);

    const orgAdminOrgIds = (grants || [])
      .filter((g) => g.role === "ORG_ADMIN")
      .map((g) => g.org_id);

    if (!orgAdminOrgIds.includes(nursery.organisation_id)) {
      return NextResponse.redirect(new URL("/staff/requests", req.url));
    }

    // Mark as accepted
    await admin
      .from("change_requests")
      .update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // TODO: in future, apply the requested changes & notify the parent

    const referer = req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
    return NextResponse.redirect(referer);
  } catch {
    const fallback = "/staff/requests";
    return NextResponse.redirect(new URL(fallback, req.url));
  }
}
// app/api/requests/apply/route.ts
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
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
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
      // Matches your other routes: redirect to login
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Load the request row with nursery + payload
    const { data: reqRow, error: reqErr } = await admin
      .from("change_requests")
      .select("id, nursery_id, child_id, type, status, payload")
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr || !reqRow) {
      return NextResponse.redirect(new URL("/staff/requests", req.url));
    }

    if (reqRow.status !== "open") {
      // Nothing to do if already accepted/rejected
      const referer =
        req.headers.get("referer") ||
        `/staff/requests?nursery_id=${reqRow.nursery_id || ""}`;
      return NextResponse.redirect(referer);
    }

    const nurseryId = reqRow.nursery_id as string | null;
    if (!nurseryId) {
      const referer = req.headers.get("referer") || `/staff/requests`;
      return NextResponse.redirect(referer);
    }

    // 2) Check this user is ORG_ADMIN for this nursery's org
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

    // 3) Only auto-apply for child_profile requests with a payload
    if (reqRow.type !== "child_profile") {
      const referer =
        req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
      return NextResponse.redirect(referer);
    }

    const payload = (reqRow.payload || {}) as any;
    const childId = (payload.child_id as string) || (reqRow.child_id as string);

    if (!childId) {
      const referer =
        req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
      return NextResponse.redirect(referer);
    }

    const proposed = (payload.proposed || {}) as Record<string, any>;
    if (!proposed || typeof proposed !== "object") {
      const referer =
        req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
      return NextResponse.redirect(referer);
    }

    // 4) Whitelist fields we will allow to be updated automatically
    const allowedChildFields: (keyof typeof proposed)[] = [
      "date_of_birth",
      "start_date",
      "end_date",
      "address_line1",
      "address_line2",
      "town",
      "postcode",
      "hours_mon",
      "hours_tue",
      "hours_wed",
      "hours_thu",
      "hours_fri",
      "gender",
      "ethnicity",
      "funding_entitlements",
      // add/remove any other child columns you are happy to auto-update
    ];

    const update: Record<string, any> = {};
    for (const key of allowedChildFields) {
      if (Object.prototype.hasOwnProperty.call(proposed, key)) {
        update[key] = proposed[key];
      }
    }

    if (Object.keys(update).length) {
      const { error: updErr } = await admin
        .from("children")
        .update(update)
        .eq("id", childId);

      if (updErr) {
        console.error("apply child_profile update error:", updErr);
        const referer =
          req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
        return NextResponse.redirect(referer);
      }
    }

    // 5) Mark request as accepted
    await admin
      .from("change_requests")
      .update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    const referer =
      req.headers.get("referer") || `/staff/requests?nursery_id=${nurseryId}`;
    return NextResponse.redirect(referer);
  } catch (e) {
    console.error("apply request error:", e);
    return NextResponse.redirect(new URL("/staff/requests", req.url));
  }
}
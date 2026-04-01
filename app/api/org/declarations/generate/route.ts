// app/api/org/declarations/generate/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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
    const body = await req.json().catch(() => ({} as any));
    const nurseryId = body.nursery_id as string | undefined;
    const termId = body.term_id as string | undefined;

    if (!nurseryId || !termId) {
      return NextResponse.json(
        { ok: false, error: "nursery_id and term_id are required" },
        { status: 400 }
      );
    }

    const supa = createServerClient(URL_BASE, ANON, { cookies: cookieBridge() });
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(URL_BASE, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Nursery → org
    const { data: nursery, error: nErr } = await admin
      .from("nurseries")
      .select("id, organisation_id")
      .eq("id", nurseryId)
      .maybeSingle();

    if (nErr || !nursery) {
      return NextResponse.json(
        { ok: false, error: "Nursery not found" },
        { status: 404 }
      );
    }

    const orgId = nursery.organisation_id as string | null;

    // 2) Check user is ORG_ADMIN for this org
    const { data: grants } = await admin
      .from("role_grants")
      .select("org_id, role")
      .eq("user_id", user.id);

    const orgAdminOrgIds = (grants || [])
      .filter((g: any) => g.role === "ORG_ADMIN")
      .map((g: any) => g.org_id);

    if (!orgId || !orgAdminOrgIds.includes(orgId)) {
      return NextResponse.json(
        { ok: false, error: "You do not manage this nursery" },
        { status: 403 }
      );
    }

    // 3) Load nursery settings (for info)
    const { data: nurSettings } = await admin
      .from("nursery_settings")
      .select("declaration_mode, declaration_lead_days")
      .eq("nursery_id", nurseryId)
      .maybeSingle();

    const declarationMode =
      (nurSettings?.declaration_mode as "one_off" | "termly" | null) ??
      "termly";
    const declarationLeadDays = nurSettings?.declaration_lead_days ?? 28;

    // 4) Load term (for message)
    const { data: term } = await admin
      .from("la_term_dates")
      .select("id, term_name, academic_year, start_date, end_date")
      .eq("id", termId)
      .maybeSingle();

    const termLabel =
      (term as any)?.term_name && (term as any)?.academic_year
        ? `${(term as any).term_name} ${(term as any).academic_year}`
        : (term as any)?.term_name || "This term";

    // 5) Load children for this nursery
    const { data: children, error: cErr } = await admin
      .from("children")
      .select("id")
      .eq("nursery_id", nurseryId);

    if (cErr) {
      return NextResponse.json(
        { ok: false, error: cErr.message },
        { status: 500 }
      );
    }

    const childIds = (children || [])
      .map((c: any) => c.id as string)
      .filter(Boolean);

    if (!childIds.length) {
      return NextResponse.json(
        { ok: true, created: 0, skipped: 0, info: "No children for this nursery" },
        { status: 200 }
      );
    }

    // 6) Existing declarations for this nursery + term
    const { data: existingDecls } = await admin
      .from("child_declarations")
      .select("child_id")
      .eq("nursery_id", nurseryId)
      .eq("term_id", termId);

    const existingChildIds = new Set(
      (existingDecls || []).map((r: any) => r.child_id as string)
    );

    const toCreateDeclFor = childIds.filter((id) => !existingChildIds.has(id));

    // 7) Insert new child_declarations rows where missing
    let created = 0;
    if (toCreateDeclFor.length) {
      const declRows = toCreateDeclFor.map((childId) => ({
        child_id: childId,
        nursery_id: nurseryId,
        term_id: termId,
        doc_type: "declaration_pdf",
        status: "pending",
      }));

      const { error: insErr } = await admin
        .from("child_declarations")
        .insert(declRows);

      if (insErr) {
        console.error("child_declarations insert error:", insErr);
        return NextResponse.json(
          { ok: false, error: "Failed to create declarations" },
          { status: 500 }
        );
      }
      created = declRows.length;
    }

    // 8) Ensure a `requests` row exists for every declaration for this nursery + term
    const allDeclChildIds = Array.from(
      new Set(childIds.filter((id) => existingChildIds.has(id) || toCreateDeclFor.includes(id)))
    );

    if (allDeclChildIds.length) {
      const { data: existingReqs } = await admin
        .from("requests")
        .select("child_id")
        .eq("nursery_id", nurseryId)
        .eq("type", "child_declaration")
        .eq("term_id", termId);

      const alreadyReqForChild = new Set(
        (existingReqs || []).map((r: any) => r.child_id as string)
      );

      const requestRows = allDeclChildIds
        .filter((childId) => !alreadyReqForChild.has(childId))
        .map((childId) => ({
          nursery_id: nurseryId,
          child_id: childId,
          type: "child_declaration",
          status: "open",
          term_id: termId,
          message: `${termLabel} declaration pending`,
        }));

      if (requestRows.length) {
        const { error: reqErr } = await admin
          .from("requests")
          .insert(requestRows);

        if (reqErr) {
          console.warn("requests insert error (declarations):", reqErr);
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        created,
        skipped: childIds.length - created,
        declaration_mode: declarationMode,
        declaration_lead_days: declarationLeadDays,
        term,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("/api/org/declarations/generate POST error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
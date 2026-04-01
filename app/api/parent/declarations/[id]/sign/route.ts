// app/api/parent/declarations/[id]/sign/route.ts
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

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
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

    const body = await req.json().catch(() => ({} as any));
    const fullName = (body.full_name as string | undefined)?.trim() || "";
    const accepted = !!body.accepted;

    if (!accepted) {
      return NextResponse.json(
        { ok: false, error: "You must confirm the declaration to continue." },
        { status: 400 }
      );
    }

    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: "Please type your full name to sign." },
        { status: 400 }
      );
    }

    const admin = createClient(URL_BASE, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const declId = params.id;

    // 1) Load declaration
    const { data: decl, error: dErr } = await admin
      .from("child_declarations")
      .select("id, child_id, nursery_id, term_id, status")
      .eq("id", declId)
      .maybeSingle();

    if (dErr || !decl) {
      return NextResponse.json(
        { ok: false, error: "Declaration not found" },
        { status: 404 }
      );
    }

    if (decl.status !== "pending") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This declaration has already been signed or is no longer active.",
        },
        { status: 400 }
      );
    }

    // 2) Check this child belongs to the current parent
    const { data: parentRow } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!parentRow) {
      return NextResponse.json(
        { ok: false, error: "Parent record not found" },
        { status: 403 }
      );
    }

    const { data: links } = await admin
      .from("child_parents")
      .select("child_id")
      .eq("parent_id", parentRow.id)
      .eq("child_id", decl.child_id);

    if (!links || !links.length) {
      return NextResponse.json(
        { ok: false, error: "You do not have access to this declaration" },
        { status: 403 }
      );
    }

    // 3) Build snapshot from current child + term
    const { data: child } = await admin
      .from("children")
      .select(
        `
        id,
        first_name,
        last_name,
        date_of_birth,
        gender,
        ethnicity,
        address_line1,
        address_line2,
        town,
        postcode,
        parent1_name,
        parent1_dob,
        parent1_email,
        parent1_nis,
        parent2_name,
        parent2_dob,
        parent2_email,
        parent2_nis,
        parent_phone,
        single_parent,
        hours_mon,
        hours_tue,
        hours_wed,
        hours_thu,
        hours_fri,
        claim_working_parent,
        claim_disadvantaged2
      `
      )
      .eq("id", decl.child_id)
      .maybeSingle();

    const { data: term } = await admin
      .from("la_term_dates")
      .select("id, term_name, academic_year, start_date, end_date")
      .eq("id", decl.term_id)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    const snapshot = {
      child,
      term,
      signed_by_name: fullName,
      signed_at: nowIso,
    };

    // 4) Update declaration row
    const { error: updErr } = await admin
      .from("child_declarations")
      .update({
        status: "signed",
        signed_at: nowIso,
        signed_by_parent_id: parentRow.id,
        signed_by_name: fullName,
        snapshot,
      })
      .eq("id", declId);

    if (updErr) {
      console.error("child_declarations update error:", updErr);
      return NextResponse.json(
        { ok: false, error: "Failed to sign declaration" },
        { status: 500 }
      );
    }

    // 5) Mark matching requests as accepted (this nursery + child + term)
    const { error: reqErr } = await admin
      .from("requests")
      .update({
        status: "accepted",
        resolved_at: nowIso,
      })
      .eq("nursery_id", decl.nursery_id)
      .eq("child_id", decl.child_id)
      .eq("term_id", decl.term_id)
      .eq("type", "child_declaration")
      .eq("status", "open");

    if (reqErr) {
      console.warn("requests update error (declarations sign):", reqErr);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("/api/parent/declarations/[id]/sign POST error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
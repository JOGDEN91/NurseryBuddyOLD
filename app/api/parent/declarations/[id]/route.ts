// app/api/parent/declarations/[id]/route.ts
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

// TODO: later replace with LA-specific text
const DEFAULT_DECLARATION_TEXT = `
I confirm that the information I have provided is accurate and true. I authorise the setting
to claim Free Early Education Entitlement and any extended funding on behalf of my child
for the hours shown, and I agree to inform the nursery immediately if any of these details
change or if I intend to claim funding at another provider.
`.trim();

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
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

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const declId = params.id;

    // 1) Load declaration
    const { data: decl, error: dErr } = await admin
      .from("child_declarations")
      .select("id, child_id, nursery_id, term_id, status, signed_at, signed_by_name, snapshot")
      .eq("id", declId)
      .maybeSingle();

    if (dErr || !decl) {
      return NextResponse.json(
        { ok: false, error: "Declaration not found" },
        { status: 404 }
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

    // 3) Child + term details
    const { data: child } = await admin
      .from("children")
      .select(
        `
        id,
        nursery_id,
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
      .select("id, label, start_date, end_date")
      .eq("id", decl.term_id)
      .maybeSingle();

    const response = {
      ok: true,
      declaration: {
        id: decl.id as string,
        status: decl.status as string,
        signed_at: decl.signed_at as string | null,
        signed_by_name: (decl.signed_by_name as string | null) ?? null,
        snapshot: (decl.snapshot as any) || null,
        child,
        term,
      },
      template: {
        title: "Funding Declaration",
        text: DEFAULT_DECLARATION_TEXT,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (e: any) {
    console.error("/api/parent/declarations/[id] GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
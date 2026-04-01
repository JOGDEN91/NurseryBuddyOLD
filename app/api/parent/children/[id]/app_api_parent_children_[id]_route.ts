// app/api/parent/children/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: (n: string, v: string, o?: any) => jar.set({ name: n, value: v, ...o }),
    remove: (n: string, o?: any) => jar.set({ name: n, value: "", ...o, maxAge: 0 }),
  };
}

// Safely extract the first defined property name from a row
function firstDefined<T extends Record<string, any>>(row: T | null | undefined, candidates: string[]) {
  if (!row) return null;
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && `${row[key]}`.trim() !== "") {
      return row[key];
    }
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    // 1) Auth + RLS proof of linkage (parents ↔ child_parents)
    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
    const { data: uRes, error: uErr } = await supa.auth.getUser();
    if (uErr || !uRes?.user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }
    const userId = uRes.user.id;

    const { data: pRow } = await supa
      .from("parents")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const parentId = pRow?.id ?? null;
    if (!parentId) return NextResponse.json({ ok: false, error: "No parent record" }, { status: 403 });

    const { data: link } = await supa
      .from("child_parents")
      .select("child_id")
      .eq("child_id", params.id)
      .eq("parent_id", parentId)
      .maybeSingle();
    if (!link) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // 2) Use service role for reads (now that linkage is proven)
    const admin = createClient(URL, SERVICE || ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Child core fields (include DoB & attendance)
    const { data: kid, error: kidErr } = await admin
      .from("children")
      .select(
        [
          "id",
          "first_name",
          "last_name",
          "photo_url",
          "nursery_id",
          "date_of_birth",
          "start_date",
          "end_date",
          "claim_working_parent",
          "claim_disadvantaged2",
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
          "updated_at"
        ].join(",")
      )
      .eq("id", params.id)
      .single();

    if (kidErr || !kid) {
      return NextResponse.json({ ok: false, error: kidErr?.message || "Child not found" }, { status: 404 });
    }

    // Nursery row (select * so we can handle any schema naming)
    let nurseryRow: any = null;
    if (kid.nursery_id) {
      const { data: nur, error: nErr } = await admin
        .from("nurseries")
        .select("*")
        .eq("id", kid.nursery_id)
        .single();
      if (!nErr && nur) nurseryRow = nur;
    }

    // Organisation row (derive org id from nursery with multiple key fallbacks)
    let organisationRow: any = null;
    const orgId =
      firstDefined(nurseryRow, [
        "organisation_id",
        "organizations_id",
        "org_id",
        "organization_id",
      ]) || null;

    if (orgId) {
      const { data: org, error: oErr } = await admin
        .from("organisations")
        .select("*")
        .eq("id", orgId as string)
        .single();
      if (!oErr && org) organisationRow = org;
    }

    // Name fallbacks (handle name/nurseries_name/organisations_name/etc)
    const nurseryName =
      firstDefined(nurseryRow, ["name", "nurseries_name", "nursery_name", "title"]) || null;

    const organisationName =
      firstDefined(organisationRow, ["name", "organisations_name", "organization_name", "org_name"]) || null;

    // Latest funding code
    let funding: any = null;
    {
      const { data: codes } = await admin
        .from("funding_codes")
        .select("id, code, issuer, expiry_date, valid_from, status, verified_at")
        .eq("child_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1);
      funding = codes?.[0] || null;
    }

    const child = {
      id: kid.id,
      first_name: kid.first_name,
      last_name: kid.last_name,
      photo_url: kid.photo_url,
      nursery_id: kid.nursery_id,
      nursery_name: nurseryName,
      organisation_name: organisationName,
      date_of_birth: kid.date_of_birth,
      start_date: kid.start_date,
      end_date: kid.end_date,
      claim_working_parent: kid.claim_working_parent,
      claim_disadvantaged2: kid.claim_disadvantaged2,
      address_line1: kid.address_line1,
      address_line2: kid.address_line2,
      town: kid.town,
      postcode: kid.postcode,
      hours_mon: kid.hours_mon,
      hours_tue: kid.hours_tue,
      hours_wed: kid.hours_wed,
      hours_thu: kid.hours_thu,
      hours_fri: kid.hours_fri,
    };

    return NextResponse.json({ ok: true, child, funding }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

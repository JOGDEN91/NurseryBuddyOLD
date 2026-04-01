// app/api/children/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSb() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set(n, v, o as any),
        remove: (n, o) =>
          cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
      },
    }
  );
}

function toISO(d?: string | null) {
  return d ? d.slice(0, 10) : null;
}

export async function GET(req: NextRequest) {
  const sb = getSb();

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const nurseryId = (url.searchParams.get("nursery_id") || "").trim();
  const includeArchived = url.searchParams.get("include_archived") === "1";

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nursery_id is required" },
      { status: 400 }
    );
  }

  let query = sb
    .from("children")
    .select(
      `
      id, nursery_id,
      first_name, last_name,
      date_of_birth, start_date, end_date,
      status, status_live,
      parent1_name, parent1_email, parent1_nis,
      parent2_name, parent2_email, parent2_nis,
      parent_phone,
      address_line1, address_line2, town, postcode,
      gender, ethnicity,
      notes,
      funded_hours_per_week, stretch,
      hours_mon, hours_tue, hours_wed, hours_thu, hours_fri,
      claim_working_parent, claim_disadvantaged2,
      single_parent
    `
    )
    .eq("nursery_id", nurseryId);

  if (!includeArchived) {
    query = query.neq("status", "archived" as any);
  }

  const { data, error } = await query;
  if (error) {
    console.error("children list error", error);
    return NextResponse.json(
      { error: "Failed to load children" },
      { status: 500 }
    );
  }

  const children =
    (data ?? []).map((c: any) => ({
      ...c,
      // alias new DB columns to legacy JSON keys so UI still works
      parent_name: c.parent1_name ?? null,
      parent_email: c.parent1_email ?? null,
      parent_nis: c.parent1_nis ?? null,
    })) ?? [];

  return NextResponse.json({ children });
}

export async function POST(req: NextRequest) {
  const sb = getSb();

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const nurseryIdFromQuery = (url.searchParams.get("nursery_id") || "").trim();

  const body = await req.json().catch(() => ({} as any));
  const nurseryId = body.nursery_id || nurseryIdFromQuery;

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nursery_id is required" },
      { status: 400 }
    );
  }

  // Normalize dates
  const dob = toISO(body.date_of_birth ?? body.dob ?? null);
  const start = toISO(body.start_date ?? null);
  const end = toISO(body.end_date ?? null);

  const payload: any = {
    nursery_id: nurseryId,
    first_name: body.first_name ?? "",
    last_name: body.last_name ?? "",
    date_of_birth: dob,
    start_date: start,
    end_date: end,
    status: body.status ?? null,

    // map legacy parent_* into parent1_*
    parent1_name: body.parent1_name ?? body.parent_name ?? null,
    parent1_email: body.parent1_email ?? body.parent_email ?? null,
    parent1_nis: body.parent1_nis ?? body.parent_nis ?? null,
    parent1_dob: body.parent1_dob ?? null,

    parent2_name: body.parent2_name ?? null,
    parent2_email: body.parent2_email ?? null,
    parent2_nis: body.parent2_nis ?? null,
    parent2_dob: body.parent2_dob ?? null,

    single_parent:
      body.single_parent === undefined ? false : !!body.single_parent,

    parent_phone: body.parent_phone ?? null,

    address_line1: body.address_line1 ?? null,
    address_line2: body.address_line2 ?? null,
    town: body.town ?? null,
    postcode: body.postcode ?? null,

    gender: body.gender ?? null,
    ethnicity: body.ethnicity ?? null,
    notes: body.notes ?? null,

    funded_hours_per_week: body.funded_hours_per_week ?? null,
    stretch: body.stretch ?? null,

    hours_mon: body.hours_mon ?? null,
    hours_tue: body.hours_tue ?? null,
    hours_wed: body.hours_wed ?? null,
    hours_thu: body.hours_thu ?? null,
    hours_fri: body.hours_fri ?? null,

    claim_working_parent: !!body.claim_working_parent,
    claim_disadvantaged2: !!body.claim_disadvantaged2,
  };

  const { data, error } = await sb
    .from("children")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("children insert error", error);
    return NextResponse.json(
      { error: "Could not add child" },
      { status: 400 }
    );
  }

  return NextResponse.json({ id: data?.id ?? null }, { status: 200 });
}
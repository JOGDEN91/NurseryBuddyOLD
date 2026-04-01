import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: "", ...options, maxAge: 0 }); },
      },
    }
  );
}

// GET /api/children/:id  -> include extra fields so the modal re-opens with saved values
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabase();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("children")
    .select(`
      id, nursery_id, first_name, last_name,
      date_of_birth, start_date, end_date,
      status, status_live,
      parent_name, parent_email, parent_nis,
      address_line1, address_line2, town, postcode,
      gender, ethnicity, notes,
      funded_hours_per_week, stretch,
      hours_mon, hours_tue, hours_wed, hours_thu, hours_fri
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ child: data });
}

// PATCH /api/children/:id  -> persist all editable fields (incl. funded/attended)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabase();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: any = {
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    date_of_birth: body.date_of_birth ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    status: body.status ?? null,
    parent_name: body.parent_name ?? null,
    parent_email: body.parent_email ?? null,
    parent_nis: body.parent_nis ?? null,
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
  };

  const { error } = await supabase
    .from("children")
    .update(patch)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: params.id });
}

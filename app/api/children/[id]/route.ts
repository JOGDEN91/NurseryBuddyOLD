// app/api/children/[id]/route.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function bridge() {
  const jar = cookies();
  return {
    get(name: string) {
      return jar.get(name)?.value;
    },
    set(name: string, value: string, options: any) {
      jar.set({ name, value, ...(options as any) });
    },
    remove(name: string, options: any) {
      jar.set({ name, value: "", ...(options as any), maxAge: 0 });
    },
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: bridge() }
  );

  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return Response.json({ child: data });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({} as any));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: bridge() }
  );

  const payload: any = {
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,

    // accept either `date_of_birth` or legacy `dob`
    date_of_birth: body.date_of_birth ?? body.dob ?? null,

    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,

    status: body.status ?? null,
    status_live: body.status_live ?? null,

    // NEW parent model
    parent1_name: body.parent1_name ?? body.parent_name ?? null,
    parent1_email: body.parent1_email ?? body.parent_email ?? null,
    parent1_nis: body.parent1_nis ?? body.parent_nis ?? null,
    parent1_dob: body.parent1_dob ?? null,

    parent2_name: body.parent2_name ?? null,
    parent2_email: body.parent2_email ?? null,
    parent2_nis: body.parent2_nis ?? null,
    parent2_dob: body.parent2_dob ?? null,

    single_parent:
      body.single_parent === undefined
        ? null
        : !!body.single_parent,

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

  const { data, error } = await supabase
    .from("children")
    .update(payload)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ ok: true, id: data?.id ?? null });
}
// app/api/funding/terms/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) =>
          cookieStore.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

const toNull = (v: any) => (v === "" ? null : v);
const numOrNull = (v: any) =>
  v === "" || v === null || v === undefined ? null : Number(v);

const buildName = (season?: any, year?: any) => {
  const s =
    typeof season === "string" && season.trim() ? season.trim() : null;
  const y =
    typeof year === "number"
      ? String(year)
      : typeof year === "string" && year.trim()
      ? year.trim()
      : null;
  return s && y ? `${s} ${y}` : undefined;
};

// PATCH /api/funding/terms/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const termId = params.id;
  if (!termId) return NextResponse.json({ error: "Missing term id" }, { status: 400 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, any> = {};

  // Optional: persist season/year and update computed name when both present
  if (body.season !== undefined) update.season = toNull(body.season);
  if (body.year !== undefined) update.year = numOrNull(body.year);
  const maybeName = buildName(body.season, body.year);
  if (maybeName !== undefined) update.name = maybeName;

  // Nursery term block
  if (body.nursery_start_date !== undefined) {
    update.nursery_start_date = toNull(body.nursery_start_date);
    // keep legacy start_date in sync
    update.start_date = toNull(body.nursery_start_date);
  }
  if (body.nursery_end_date !== undefined) {
    update.nursery_end_date = toNull(body.nursery_end_date);
    // keep legacy end_date in sync
    update.end_date = toNull(body.nursery_end_date);
  }
  if (body.nursery_weeks !== undefined)
    update.nursery_weeks = numOrNull(body.nursery_weeks);

  // LA term block
  if (body.la_start_date !== undefined)
    update.la_start_date = toNull(body.la_start_date);
  if (body.la_end_date !== undefined)
    update.la_end_date = toNull(body.la_end_date);
  if (body.la_weeks !== undefined) update.la_weeks = numOrNull(body.la_weeks);

  // Deadlines
  // (Your table has nursery_deadline — not provider_deadline)
  if (body.nursery_deadline !== undefined)
    update.nursery_deadline = toNull(body.nursery_deadline);
  if (body.la_portal_open !== undefined)
    update.la_portal_open = toNull(body.la_portal_open);
  if (body.la_portal_close !== undefined)
    update.la_portal_close = toNull(body.la_portal_close);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("funding_terms")
    .update(update)
    .eq("id", termId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Term not found" }, { status: 404 });

  return NextResponse.json({ ok: true, term: data });
}

// DELETE (left as-is for convenience)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const termId = params.id;
  if (!termId) return NextResponse.json({ error: "Missing term id" }, { status: 400 });

  const { data, error } = await supabase
    .from("funding_terms")
    .delete()
    .eq("id", termId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id: data.id });
}

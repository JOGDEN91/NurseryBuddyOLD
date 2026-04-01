// app/api/nursery-flags/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => store.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

// GET /api/nursery-flags?nurseryId=...
export async function GET(req: Request) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nurseryId");

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nurseryId query param is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("nurseries")
    .select("id, requires_two_parents_details")
    .eq("id", nurseryId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Nursery not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      nursery_id: data.id,
      requires_two_parents_details: !!data.requires_two_parents_details,
    },
    { status: 200 }
  );
}

// PUT /api/nursery-flags
// body: { nursery_id, requires_two_parents_details: boolean }
export async function PUT(req: Request) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const nurseryId = body?.nursery_id as string | undefined;
  const flag = !!body?.requires_two_parents_details;

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nursery_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("nurseries")
    .update({ requires_two_parents_details: flag })
    .eq("id", nurseryId)
    .select("id, requires_two_parents_details")
    .maybeSingle();

  if (error) {
    console.error("nursery-flags update error", error);
    return NextResponse.json(
      { error: "Failed to update nursery flags" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      nursery_id: data?.id,
      requires_two_parents_details: !!data?.requires_two_parents_details,
    },
    { status: 200 }
  );
}
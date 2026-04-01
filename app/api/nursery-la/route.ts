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
  const laId = (body?.la_id ?? null) as string | null;

  if (!nurseryId) {
    return NextResponse.json({ error: "nursery_id required" }, { status: 400 });
  }

  // Rely on RLS + RequireOrgAdmin for auth; Supabase will reject if user
  // isn't allowed to update this nursery.
  const { data, error } = await supabase
    .from("nurseries")
    .update({ la_id: laId })
    .eq("id", nurseryId)
    .select("id, la_id")
    .maybeSingle();

  if (error) {
    console.error("update nursery la_id error", error);
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }

  return NextResponse.json({ nursery: data }, { status: 200 });
}

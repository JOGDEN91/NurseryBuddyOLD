import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Returns the nursery_id for the current user’s NURSERY-scope grant.
// If multiple, returns the first (you can change the selection logic later).
export async function GET(_req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set(n, v, o as any),
        remove: (n, o) => cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: grants, error: gErr } = await supabase
    .from("role_grants")
    .select("scope, nursery_id, starts_at")
    .eq("user_id", user.id)
    .eq("scope", "NURSERY")
    .is("nursery_id", null, { negate: true })
    .order("starts_at", { ascending: false })
    .limit(1);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const nursery_id = grants?.[0]?.nursery_id ?? null;
  return NextResponse.json({ nursery_id });
}

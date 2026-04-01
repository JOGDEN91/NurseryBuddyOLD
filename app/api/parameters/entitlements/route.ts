import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// GET /api/parameters/entitlements
export async function GET() {
  const jar = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) => jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );

  // Only ACTIVE entitlements for org/staff use
  const { data, error } = await supabase
    .from("funding_entitlements")
    .select("id, name, code, description, hours_per_week")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entitlements: data ?? [] });
}

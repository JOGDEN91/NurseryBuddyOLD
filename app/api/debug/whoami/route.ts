// app/api/debug/whoami/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set(name, value, options as any);
        },
        remove(name, options) {
          cookieStore.set(name, "", { ...options, maxAge: 0 } as any);
        },
      },
    }
  );

  const names = cookieStore.getAll().map((c) => ({ name: c.name, valuePreview: (c.value ?? "").slice(0, 16) + "…" }));

  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  let grants: any[] = [];
  let gErr: any = null;
  if (user) {
    const { data, error } = await supabase
      .from("role_grants")
      .select("role, scope, org_id, nursery_id, created_at")
      .eq("user_id", user.id);
    grants = data ?? [];
    gErr = error ?? null;
  }

  return NextResponse.json({
    cookies: names,
    user,
    userErr: userErr ? String(userErr.message ?? userErr) : null,
    grants,
    gErr: gErr ? String(gErr.message ?? gErr) : null,
    projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

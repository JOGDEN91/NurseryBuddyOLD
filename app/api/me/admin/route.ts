// app/api/me/admin/route.ts

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  // who is logged in?
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // SUPER_ADMIN at PLATFORM?
  const { data, error } = await supabase
    .from("role_grants")
    .select("role, scope")
    .eq("user_id", user.id)
    .eq("role", "SUPER_ADMIN")
    .eq("scope", "PLATFORM")
    .limit(1);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: !!data?.length });
}

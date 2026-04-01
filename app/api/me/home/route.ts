import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ path: "/auth/sign-in" });

  // SUPER_ADMIN @ PLATFORM → admin
  const { data: sa } = await supabase
    .from("role_grants")
    .select("role,scope")
    .eq("user_id", user.id)
    .eq("role", "SUPER_ADMIN")
    .eq("scope", "PLATFORM")
    .limit(1);
  if (sa && sa.length) return NextResponse.json({ path: "/admin/overview" });

  // staff (org admin / nursery manager)
  const { data: staff } = await supabase
    .from("role_grants")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["ORG_ADMIN", "NURSERY_MANAGER"])
    .limit(1);
  if (staff && staff.length) return NextResponse.json({ path: "/staff/dashboard" });

  // parent
  const { data: parent } = await supabase
    .from("role_grants")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "PARENT")
    .limit(1);
  if (parent && parent.length) return NextResponse.json({ path: "/parent/dashboard" });

  // default fallback
  return NextResponse.json({ path: "/account/profile" });
}

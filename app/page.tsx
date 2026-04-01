// app/page.tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Keep this dynamic so auth cookies are read fresh
export const dynamic = "force-dynamic";

export default async function Home() {
  // Supabase SSR client using the same cookie bridge as middleware
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
          cookieStore.set(name, "", { ...(options as any), maxAge: 0 });
        },
      },
    }
  );

  // 1) Who’s logged in?
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session → go to the chooser (not the old /auth/sign-in)
  if (!user) {
    redirect("/auth/choose");
  }

  // 2) Look up roles for routing
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, scope")
    .eq("user_id", user.id);

  const has = (roles: string[]) =>
    (grants || []).some((g) => roles.includes(g.role));

  // Route by priority
  if (has(["SUPER_ADMIN"])) redirect("/admin/overview");
  if (has(["ORG_ADMIN"])) redirect("/org/overview");             // ⟵ new org area
  if (has(["NURSERY_MANAGER", "STAFF"])) redirect("/staff/dashboard");
  if (has(["PARENT"])) redirect("/parent/dashboard");

  // 3) Fallbacks:
  // If you still use /account/profile for first-time setup, send them there.
  // Otherwise, show 403 if they have no usable role yet.
  redirect("/account/profile");
}

// app/org/(guards)/RequireOrgAdmin.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export default async function RequireOrgAdmin({ children }: { children: ReactNode }) {
  // RSC-safe Supabase client (read-only cookie adapter)
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // In Server Components on Next 14.2+, cookie writes are disallowed.
        // Middleware handles refresh; these are intentional no-ops here.
        set() {},
        remove() {},
      },
    }
  );

  // ---- Auth guard (no user -> auth flow) -----------------------------------
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) {
    // keep your existing flow
    redirect("/auth/choose");
  }

  // ---- Case-insensitive role gate (RLS must allow select on role_grants) ----
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role")
    .eq("user_id", user.id);

  const roles = new Set((grants ?? []).map((g) => (g.role ?? "").toUpperCase()));
  const isOrgAdmin = roles.has("ORG_ADMIN");

  if (!isOrgAdmin) {
    // If they’re nursery staff but not org admin, send to staff landing
    if (roles.has("NURSERY_MANAGER") || roles.has("STAFF")) {
      // per your stable map: app/staff/overview/page.tsx
      redirect("/staff/overview");
    }
    // Fallback for authenticated users without the right org role
    redirect("/account/profile");
  }

  // ---- Allowed through ------------------------------------------------------
  return <>{children}</>;
}

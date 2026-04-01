// app/org/(guards)/RequireOrgAdmin.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function RequireOrgAdmin({ children }: { children: ReactNode }) {
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/choose");

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role")
    .eq("user_id", user.id);

  const roles = new Set((grants ?? []).map((g) => g.role));
  const isOrgAdmin = roles.has("ORG_ADMIN");

  if (!isOrgAdmin) {
    // If they’re nursery staff but not org admin, keep them in staff area
    if (roles.has("NURSERY_MANAGER") || roles.has("STAFF")) redirect("/staff/dashboard");
    redirect("/account/profile");
  }

  return <>{children}</>;
}

import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { ScopeProvider } from "@/components/scope/ScopeProvider";
import RequireOrgAdmin from "./(guards)/RequireOrgAdmin";
import OrgSideNav from "./_components/OrgSideNav";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
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
  } = await supabase.auth.getUser();

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user!.id);

  const orgId =
    (grants || []).find((g) => g.role === "ORG_ADMIN")?.org_id ?? null;

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const options = (nurseries ?? []).map((n) => ({ id: n.id, name: n.name }));
  const initialNurseryId = options[0]?.id ?? null;

  // Contextual menus:
  const orgNav = [
    { href: "/org/overview", label: "Overview" },
    { href: "/org/staff", label: "Staff" },
    { href: "/org/finance", label: "Finance" },
  ];
  const nurseryNav = [
    { href: "/org/funding", label: "Funding" },
    { href: "/org/requests", label: "Requests" },
    { href: "/org/documents", label: "Documents" },
    { href: "/org/children", label: "Children" },
  ];

  return (
    <RequireOrgAdmin>
      <ScopeProvider initialMode="org" initialNurseryId={initialNurseryId}>
        <div style={{ display: "flex", minHeight: "100vh", background: "#FAF9F7" }}>
          <OrgSideNav
            nurseries={options}
            orgNav={orgNav}
            nurseryNav={nurseryNav}
          />
          <main style={{ flex: 1, padding: 24 }}>{children}</main>
        </div>
      </ScopeProvider>
    </RequireOrgAdmin>
  );
}

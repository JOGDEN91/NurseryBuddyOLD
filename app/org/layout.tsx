// app/org/layout.tsx
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import RequireOrgAdmin from "./(guards)/RequireOrgAdmin";
import OrgClientShell from "./OrgClientShell";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => {
          try {
            cookieStore.set({ name: n, value: v, ...(o as any) });
          } catch {
            /* no-op in RSC */
          }
        },
        remove: (n, o) => {
          try {
            cookieStore.set({ name: n, value: "", ...(o as any), maxAge: 0 });
          } catch {
            /* no-op in RSC */
          }
        },
      },
    }
  );

  // --- Auth (guarded) ---
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // --- Role grants (guarded: only query if we have a user) ---
  let grants: Array<{ role: string; org_id: string | null }> = [];
  if (user?.id) {
    const { data: g } = await supabase
      .from("role_grants")
      .select("role, org_id")
      .eq("user_id", user.id);
    grants = g ?? [];
  }

  const orgId =
    (grants || []).find((g) => (g.role ?? "").toUpperCase() === "ORG_ADMIN")
      ?.org_id ?? null;

  // --- Organisation name ---
  let orgName = "Organisation";
  if (orgId) {
    const { data: orgRow } = await supabase
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    if (orgRow?.name) orgName = orgRow.name;
  }

  // --- Nurseries for this org (with legacy fallbacks) ---
  let nurseries: Array<{ id: string; name: string }> = [];

  if (orgId) {
    const { data, error } = await supabase
      .from("nurseries")
      .select("id, name")
      .eq("organisation_id", orgId)
      .order("name", { ascending: true });

    if (!error && data) {
      nurseries = data as any;
    } else {
      const { data: altA } = await supabase
        .from("nururies" as any)
        .select("id, name")
        .eq("organisation_id", orgId)
        .order("name", { ascending: true });
      const { data: altB } = await supabase
        .from("nurceries" as any)
        .select("id, name")
        .eq("organisation_id", orgId)
        .order("name", { ascending: true });

      nurseries = (altA as any) ?? (altB as any) ?? [];
    }
  }

  const options = (nurseries ?? []).map((n) => ({ id: n.id, name: n.name }));
  const initialNurseryId = options[0]?.id ?? null;

  // --- Navigation definitions ---
  const orgNav = [
    { href: "/org/overview", label: "Overview" },
    { href: "/org/staff", label: "Staff" },
    { href: "/org/settings", label: "Settings" },
    { href: "/org/finance", label: "Finance" },
    { href: "/org/audit", label: "Audit" }, // NEW
  ];

  const nurseryNav = [
    { href: "/org/nursery/overview", label: "Overview" },
    { href: "/org/funding", label: "Funding" },
    { href: "/org/declarations", label: "Declarations" },
    { href: "/org/requests", label: "Requests" },
    { href: "/org/documents", label: "Documents" },
    { href: "/org/children", label: "Children" },
  ];

  return (
    <RequireOrgAdmin>
      <OrgClientShell
        orgName={orgName}
        nurseries={options}
        orgNav={orgNav}
        nurseryNav={nurseryNav}
        initialNurseryId={initialNurseryId}
      >
        {children}
      </OrgClientShell>
    </RequireOrgAdmin>
  );
}
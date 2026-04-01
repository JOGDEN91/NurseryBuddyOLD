// app/org/settings/page.tsx
import StaffCard from "@/components/StaffCard";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import RequireOrgAdmin from "../(guards)/RequireOrgAdmin";
import SettingsClient from "./SettingsClient";
import TermSettingsClient from "./TermSettingsClient";
import FundingRatesClient from "./FundingRatesClient";

export const dynamic = "force-dynamic";

function getSupabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => store.get(n)?.value,
        set() {
          // RSC: middleware handles refresh; no-op here
        },
        remove() {},
      },
    }
  );
}

export default async function OrgSettingsPage() {
  const supabase = getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>Unauthenticated.</div>;
  }

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user.id);

  const orgId =
    (grants ?? []).find(
      (g) => (g.role ?? "").toUpperCase() === "ORG_ADMIN"
    )?.org_id ?? null;

  if (!orgId) {
    return <div>Org admin role required.</div>;
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, financial_year_end")
    .eq("id", orgId)
    .maybeSingle();

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name, la_id")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const { data: localAuthorities } = await supabase
    .from("local_authorities")
    .select("id, name")
    .order("name", { ascending: true });

  const orgName = org?.name ?? "";

  return (
    <RequireOrgAdmin>
      <div style={{ display: "grid", gap: 16 }}>
        <StaffCard title="Settings scope" noStretch>
          <div style={{ fontSize: 14, opacity: 0.85 }}>
            <div>
              <b>Organisation:</b> {orgName || "—"}
            </div>
            <div style={{ marginTop: 6 }}>
              Choose whether to edit <b>organisation-wide defaults</b> or{" "}
              <b>override for a specific nursery</b>.
            </div>
          </div>
        </StaffCard>

        <SettingsClient
          orgId={orgId}
          orgName={orgName}
          nurseries={(nurseries ?? []).map((n: any) => ({
            id: n.id as string,
            name: n.name as string,
            laId: (n.la_id as string | null) ?? null,
          }))}
          localAuthorities={(localAuthorities ?? []).map((la: any) => ({
            id: la.id as string,
            name: la.name as string,
          }))}
        />

        <TermSettingsClient
          nurseries={(nurseries ?? []).map((n: any) => ({
            id: n.id as string,
            name: n.name as string,
          }))}
        />

        {/* Org-entered hourly funding rates */}
        {orgId && (
          <FundingRatesClient
            orgId={orgId}
            orgName={orgName}
            nurseries={(nurseries ?? []).map((n: any) => ({
              id: n.id as string,
              name: n.name as string,
            }))}
          />
        )}
      </div>
    </RequireOrgAdmin>
  );
}
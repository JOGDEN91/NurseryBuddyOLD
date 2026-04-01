// app/org/overview/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import OrgOverviewClient from "./OrgOverviewClient";

export const dynamic = "force-dynamic";

/** Supabase (server) with read-only cookies */
function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

type EffectiveSettings = {
  invoice_mode: "monthly" | "termly";
};

export default async function OrgOverviewPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // Find orgId via role_grants (ORG_ADMIN)
  let orgId: string | null = null;
  if (user?.id) {
    const { data: grants } = await supabase.from("role_grants").select("role, org_id").eq("user_id", user.id);

    orgId =
      (grants ?? []).find((g: any) => (g.role ?? "").toUpperCase() === "ORG_ADMIN" && g.org_id)?.org_id ?? null;
  }

  // Organisation name
  let orgName = "Organisation";
  if (orgId) {
    const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).maybeSingle();
    if (org?.name) orgName = org.name;
  }

  // Nurseries in org
  let nurseries: Array<{ id: string; name: string }> = [];
  if (orgId) {
    const { data } = await supabase
      .from("nurseries")
      .select("id, name")
      .eq("organisation_id", orgId)
      .order("name", { ascending: true });

    nurseries = (data ?? []) as any;
  }

  // Anchor nursery for default settings (cookie-selected nursery if valid, else first nursery)
  const cookieStore = cookies();
  const cookieNurseryId = cookieStore.get("nb.nurseryId")?.value ?? null;
  const anchorNurseryId =
    (cookieNurseryId && nurseries.some((n) => n.id === cookieNurseryId) ? cookieNurseryId : nurseries[0]?.id) ?? null;

  let invoiceModeDefault: "monthly" | "termly" = "monthly";
  if (anchorNurseryId) {
    const { data } = await supabase.rpc("get_effective_settings", { p_nursery_id: anchorNurseryId }).select("*");
    const settings = (data?.[0] as EffectiveSettings) ?? null;
    if (settings?.invoice_mode === "termly") invoiceModeDefault = "termly";
  }

  const termIdParam = typeof searchParams?.term_id === "string" ? searchParams.term_id : null;

  return (
    <OrgOverviewClient
      orgName={orgName}
      nurseries={nurseries}
      initialTermId={termIdParam}
      invoiceModeDefault={invoiceModeDefault}
    />
  );
}
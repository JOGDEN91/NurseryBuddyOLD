// app/org/finance/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import nextDynamic from "next/dynamic";

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
        // RSC: writes are ignored; middleware refreshes cookies
        set() {},
        remove() {},
      },
    }
  );
}

type Term = {
  id: string;
  name: string;
  nursery_id: string;
  start_date: string | null;
  end_date: string | null;
};

type EffectiveSettings = {
  nursery_id: string;
  org_id: string;
  invoice_mode: "monthly" | "termly";
  hourly_rate: number | null;
  additional_hourly_rate: number | null;
  stretched_weeks: number | null; // e.g., 38 / 47 / 51 / 52
  financial_year_end: string | null;
  fixed_terms_enabled: boolean;
  free_alternative_note: string | null;
};

const CANONICAL_SEASON_TERM_RE = /^(Autumn|Spring|Summer) \d{4}\/\d{2}$/;

async function getOrgAndNurseries(userId: string | undefined | null) {
  const supabase = getSupabaseServer();
  if (!userId)
    return {
      orgId: null as string | null,
      nurseries: [] as { id: string; name: string }[],
    };

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", userId);

  const orgId =
    (grants ?? []).find((g) => (g.role ?? "").toUpperCase() === "ORG_ADMIN")
      ?.org_id ?? null;

  let nurseries: Array<{ id: string; name: string }> = [];
  if (orgId) {
    const { data } = await supabase
      .from("nurseries")
      .select("id, name")
      .eq("organisation_id", orgId)
      .order("name", { ascending: true });
    nurseries = (data ?? []) as any;
  }

  return { orgId, nurseries };
}

async function getTerms(nurseryId: string | null) {
  const supabase = getSupabaseServer();
  if (!nurseryId) return { current: null as Term | null, terms: [] as Term[] };

  const { data } = await supabase
    .from("funding_terms")
    .select("*")
    .eq("nursery_id", nurseryId)
    .order("start_date", { ascending: true });

  const list: Term[] = (data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    nursery_id: t.nursery_id,
    start_date: t.start_date ?? null,
    end_date: t.end_date ?? null,
  }));

  // Harden: prefer canonical seasonal terms if they exist.
  // Fallback to legacy list only if none match (so we don’t break during cleanup).
  const canonical = list.filter((t) => CANONICAL_SEASON_TERM_RE.test(String(t.name ?? "")));
  const usable = canonical.length > 0 ? canonical : list;

  const now = new Date();
  const current =
    usable.find(
      (t) =>
        t.start_date &&
        t.end_date &&
        new Date(t.start_date) <= now &&
        now <= new Date(t.end_date)
    ) ?? null;

  return { current, terms: usable };
}

async function getEffectiveSettings(nurseryId: string | null) {
  const supabase = getSupabaseServer();
  if (!nurseryId) return null;
  const { data } = await supabase
    .rpc("get_effective_settings", { p_nursery_id: nurseryId })
    .select("*");
  return (data?.[0] as EffectiveSettings) ?? null;
}

/* ---------- Client helper (lazy import) ---------- */
const FinanceClient = nextDynamic(() => import("./FinanceClient"), {
  ssr: false,
});

export default async function OrgFinance() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) Org & nursery list
  const { orgId, nurseries } = await getOrgAndNurseries(user?.id);

  // Prefer cookie selection if present
  const cookieStore = cookies();
  const cookieNursery = cookieStore.get("nb.nurseryId")?.value ?? null;
  const initialNurseryId = cookieNursery || nurseries[0]?.id || null;

  // 2) Initial term + settings for the first nursery
  const { current, terms } = await getTerms(initialNurseryId);
  const selectedTerm = current ?? terms[0] ?? null;

  const settings = await getEffectiveSettings(initialNurseryId);
  const weeks = Math.max(1, Number(settings?.stretched_weeks ?? 38));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <FinanceClient
        orgId={orgId}
        nurseries={nurseries}
        initialNurseryId={initialNurseryId}
        initialTerm={selectedTerm}
        initialTerms={terms}
        invoiceModeDefault={settings?.invoice_mode ?? "monthly"}
        weeks={weeks}
      />
    </div>
  );
}

// app/admin/local-authorities/page.tsx
import { requireAdmin } from "@/lib/admin";
import LAClient from "./LAClient";

export const dynamic = "force-dynamic";

type LA = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  public_url: string | null;
  portal_url: string | null;
  is_active: boolean | null;
  last_reviewed_at: string | null;
};

export default async function AdminLocalAuthoritiesPage() {
  const { supabase } = await requireAdmin(); // SSR + cookies() bridge (invariant)

  const { data: las, error } = await supabase
    .from("local_authorities")
    .select("id,name,country,region,public_url,portal_url,is_active,last_reviewed_at")
    .order("name");

  const items: LA[] = las ?? [];
  const ids = items.map((x) => x.id);

  async function countByLa(table: string) {
    if (ids.length === 0) return new Map<string, number>();
    const { data } = await supabase.from(table).select("la_id").in("la_id", ids);
    const m = new Map<string, number>();
    (data ?? []).forEach((r: any) => m.set(r.la_id, (m.get(r.la_id) ?? 0) + 1));
    return m;
  }

  const [rates, terms, docs, windows, pays, supps] = await Promise.all([
    countByLa("la_rates"),
    countByLa("la_term_dates"),
    countByLa("la_documents"),
    countByLa("la_claim_windows"),
    countByLa("la_payment_schedule"),
    countByLa("la_supplements"),
  ]);

  const rows = items.map((la) => ({
    ...la,
    la_rates_count: rates.get(la.id) ?? 0,
    la_term_dates_count: terms.get(la.id) ?? 0,
    la_documents_count: docs.get(la.id) ?? 0,
    la_claim_windows_count: windows.get(la.id) ?? 0,
    la_payment_schedule_count: pays.get(la.id) ?? 0,
    la_supplements_count: supps.get(la.id) ?? 0,
  }));

  return <LAClient las={rows as any} serverError={error?.message ?? null} />;
}

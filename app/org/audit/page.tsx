// app/org/audit/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

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

function extractSeason(termName: string): string | null {
  const m = termName.match(/\(([^)]+)\)/);
  if (m?.[1]) return m[1].trim();
  const seasons = ["Autumn", "Spring", "Summer", "Winter"];
  const lower = (termName || "").toLowerCase();
  for (const s of seasons) if (lower.includes(s.toLowerCase())) return s;
  return null;
}

type TermOpt = {
  anchor_id: string; // la_term_dates.id to anchor the season group
  label: string;
  start_date: string | null;
  end_date: string | null;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div style={{ padding: 16, opacity: 0.8 }}>Not signed in.</div>;
  }

  // Org context
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user.id);

  const orgId =
    (grants ?? []).find((g: any) => (g.role ?? "").toUpperCase() === "ORG_ADMIN")
      ?.org_id ?? null;

  if (!orgId) {
    return <div style={{ padding: 16, opacity: 0.8 }}>Forbidden.</div>;
  }

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name, la_id")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const nurseryList = (nurseries ?? []) as Array<{ id: string; name: string; la_id: string | null }>;
  const cookieStore = cookies();
  const cookieNurseryId = cookieStore.get("nb.nurseryId")?.value ?? null;

  const defaultNurseryId =
    (cookieNurseryId && nurseryList.some((n) => n.id === cookieNurseryId)
      ? cookieNurseryId
      : nurseryList[0]?.id) ?? null;

  const initialNurseryId =
    typeof searchParams?.nursery_id === "string" ? searchParams.nursery_id : defaultNurseryId;

  const laId =
    nurseryList.find((n) => n.id === initialNurseryId)?.la_id ?? null;

  // Build season term options for dropdown (based on LA)
  let terms: TermOpt[] = [];
  if (laId) {
    const { data: rows } = await supabase
      .from("la_term_dates")
      .select("id, term_name, academic_year, start_date, end_date")
      .eq("la_id", laId)
      .order("start_date", { ascending: true });

    const groups = new Map<
      string,
      { anchor_id: string; label: string; start_date: string | null; end_date: string | null }
    >();

    (rows ?? []).forEach((r: any) => {
      const season = extractSeason(r.term_name ?? "");
      const ay = r.academic_year ?? null;
      const label = season && ay ? `${season} ${ay}` : (r.term_name ?? "Term");

      const existing = groups.get(label);
      if (!existing) {
        groups.set(label, {
          anchor_id: r.id,
          label,
          start_date: r.start_date ?? null,
          end_date: r.end_date ?? null,
        });
      } else {
        if (r.start_date && (!existing.start_date || r.start_date < existing.start_date)) existing.start_date = r.start_date;
        if (r.end_date && (!existing.end_date || r.end_date > existing.end_date)) existing.end_date = r.end_date;
      }
    });

    terms = Array.from(groups.values()).sort((a, b) => {
      const as = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bs = b.start_date ? new Date(b.start_date).getTime() : 0;
      return as - bs;
    });
  }

  // Pick default term: current else most recent past
  const now = Date.now();
  const current =
    terms.find((t) => {
      const s = t.start_date ? new Date(t.start_date).getTime() : NaN;
      const e = t.end_date ? new Date(t.end_date).getTime() : NaN;
      return Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e;
    }) ?? null;

  const fallback = terms.length ? terms[terms.length - 1] : null;

  const initialTermId =
    (typeof searchParams?.term_id === "string" && searchParams.term_id) ||
    current?.anchor_id ||
    fallback?.anchor_id ||
    "";

  return (
    <AuditClient
      orgId={orgId}
      nurseries={nurseryList.map((n) => ({ id: n.id, name: n.name }))}
      initialNurseryId={initialNurseryId}
      terms={terms}
      initialTermId={initialTermId}
    />
  );
}
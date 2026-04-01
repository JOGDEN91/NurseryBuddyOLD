// app/api/funding/terms/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) => cookieStore.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

type FundingTermRow = {
  id: string;
  name: string | null;
  nursery_id: string;

  la_start_date?: string | null;
  la_start_on?: string | null;
  la_term_start_date?: string | null;

  la_end_date?: string | null;
  la_end_on?: string | null;
  la_term_end_date?: string | null;

  start_date?: string | null;
  end_date?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

const toIso = (x?: string | null) => (x ? String(x).slice(0, 10) : null);

function extractSeasonFromLaTermName(termName: string): "Autumn" | "Spring" | "Summer" | null {
  const m = termName.match(/\((autumn|spring|summer)\)/i);
  if (m?.[1]) {
    const s = m[1].toLowerCase();
    return s === "autumn" ? "Autumn" : s === "spring" ? "Spring" : "Summer";
  }
  if (/autumn/i.test(termName)) return "Autumn";
  if (/spring/i.test(termName)) return "Spring";
  if (/summer/i.test(termName)) return "Summer";
  return null;
}

function parseFundingTermName(name: string | null): { season: "Autumn" | "Spring" | "Summer" | null; ay: string | null } {
  const t = String(name ?? "").trim();
  if (!t) return { season: null, ay: null };

  // Expect "Autumn 2025/26" etc.
  const m = t.match(/^(Autumn|Spring|Summer)\s+(\d{4}\/\d{2}|\d{4})/i);
  if (!m) return { season: null, ay: null };

  const season = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const ay = m[2] ?? null;
  return { season: season as any, ay };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const nurseryId = searchParams.get("nursery_id");
  if (!nurseryId) return NextResponse.json({ error: "Missing nursery_id" }, { status: 400 });

  // 1) Nursery → la_id (to compute seasonal LA blocks)
  const { data: nursery, error: nErr } = await supabase
    .from("nurseries")
    .select("id, la_id")
    .eq("id", nurseryId)
    .maybeSingle();

  if (nErr || !nursery) return NextResponse.json({ error: "Nursery not found" }, { status: 404 });

  const laId = (nursery as any).la_id as string | null;

  // 2) LA term blocks grouped into seasonal labels (same logic you already use in /api/org/declarations)
  const laGroups = new Map<
    string,
    {
      anchorId: string;
      minStart: string | null;
      maxEnd: string | null;
      memberIds: string[];
    }
  >();

  if (laId) {
    const { data: rows } = await supabase
      .from("la_term_dates")
      .select("id, term_name, academic_year, start_date, end_date")
      .eq("la_id", laId)
      .order("start_date", { ascending: true });

    for (const r of (rows ?? []) as any[]) {
      const season = extractSeasonFromLaTermName(String(r.term_name ?? ""));
      const ay = String(r.academic_year ?? "").trim();
      if (!season || !ay) continue;

      const label = `${season} ${ay}`;
      const start = toIso(r.start_date);
      const end = toIso(r.end_date);

      const existing = laGroups.get(label);
      if (!existing) {
        laGroups.set(label, {
          anchorId: String(r.id),
          minStart: start,
          maxEnd: end,
          memberIds: [String(r.id)],
        });
      } else {
        existing.memberIds.push(String(r.id));

        if (start && (!existing.minStart || start < existing.minStart)) existing.minStart = start;
        if (end && (!existing.maxEnd || end > existing.maxEnd)) existing.maxEnd = end;
      }
    }
  }

  // 3) Funding terms (canonical)
  const { data, error } = await supabase
    .from("funding_terms")
    .select("*")
    .eq("nursery_id", nurseryId)
    .order("start_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as FundingTermRow[];

  const terms = rows.map((t) => {
    const { season, ay } = parseFundingTermName(t.name ?? null);

    // Compute LA window from grouped blocks if possible (best)
    const groupKey = season && ay ? `${season} ${ay}` : null;
    const g = groupKey ? laGroups.get(groupKey) ?? null : null;

    // Fall back to whatever is stored on funding_terms if group is missing
    const storedLaStart = t.la_start_date ?? t.la_start_on ?? t.la_term_start_date ?? null;
    const storedLaEnd = t.la_end_date ?? t.la_end_on ?? t.la_term_end_date ?? null;

    const laStart = g?.minStart ?? toIso(storedLaStart);
    const laEnd = g?.maxEnd ?? toIso(storedLaEnd);

    const start = toIso(t.start_date ?? t.starts_on ?? null);
    const end = toIso(t.end_date ?? t.ends_on ?? null);

    const now = new Date();
    const s = laStart ? new Date(laStart) : (start ? new Date(start) : null);
    const e = laEnd ? new Date(laEnd) : (end ? new Date(end) : null);
    const is_current = s && e ? s <= now && now <= e : false;

    return {
      id: t.id,
      name: t.name ?? "Term",
      nursery_id: t.nursery_id,

      // canonical seasonal mapping for OrgSideNav term_id anchors
      anchor_la_term_date_id: g?.anchorId ?? null,
      blocks: (g?.memberIds ?? []).map((id) => ({ id })),

      // what clients use for age-at-start
      la_start_date: laStart,
      la_end_date: laEnd,

      // kept for context
      start_date: start,
      end_date: end,

      is_current,
    };
  });

  // Sort by LA start (preferred) then term start
  terms.sort((a: any, b: any) => {
    const ak = a.la_start_date ?? a.start_date ?? "";
    const bk = b.la_start_date ?? b.start_date ?? "";
    return String(ak).localeCompare(String(bk));
  });

  return NextResponse.json({ terms });
}
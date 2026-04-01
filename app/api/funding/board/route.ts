import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  // Find user nursery_id
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("nursery_id")
    .eq("id", uid)
    .single();

  const nursery_id = profile?.nursery_id;
  if (!nursery_id) return NextResponse.json({ current: null, next: null });

  // Get current & next terms
  const { data: terms, error: termErr } = await supabase
    .from("funding_terms")
    .select("*")
    .eq("nursery_id", nursery_id)
    .in("is_current", [true, false])
    .in("is_next", [true, false]);

  if (termErr) return NextResponse.json({ error: termErr.message }, { status: 500 });

  const current = terms?.find(t => t.is_current) ?? null;
  const next = terms?.find(t => t.is_next) ?? null;

  async function fetchEnrolments(termId?: string | null) {
    if (!termId) return [];
    const { data: enrols } = await supabase
      .from("funding_enrolments")
      .select(`
        id, child_id, term_id, status, stretch, weeks, total_hours_week, updated_at,
        child:children ( first_name, last_name, date_of_birth ),
        code:funding_codes!funding_codes_child_id_fkey ( code, code_type, expires_on, status )
      `)
      .eq("term_id", termId)
      .order("updated_at", { ascending: false });

    // Ensure code is a single object (if multiple records, pick the latest by expires_on)
    return (enrols ?? []).map((e: any) => {
      const code = Array.isArray(e.code)
        ? [...e.code].sort((a, b) => (a?.expires_on ?? "") < (b?.expires_on ?? "") ? 1 : -1)[0]
        : e.code;
      return { ...e, code };
    });
  }

  const [currentEnrols, nextEnrols] = await Promise.all([
    fetchEnrolments(current?.id),
    fetchEnrolments(next?.id),
  ]);

  function groupByStatus(items: any[]) {
    const g = { pending: [] as any[], updated: [] as any[], verified: [] as any[], rejected: [] as any[] };
    for (const it of items) (g as any)[it.status]?.push(it);
    return g;
  }

  return NextResponse.json({
    current: current ? { term: current, groups: groupByStatus(currentEnrols) } : null,
    next:    next    ? { term: next,    groups: groupByStatus(nextEnrols) }    : null,
  });
}
// app/api/funding/table/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSb() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set(n, v, o as any),
        remove: (n, o) =>
          cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
      },
    }
  );
}

type TermRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current?: boolean;
};

function toISO(d?: string | null) {
  return d ? d.slice(0, 10) : null;
}
function overlapsTerm(
  childStart?: string | null,
  childEnd?: string | null,
  termStart?: string | null,
  termEnd?: string | null
) {
  if (!termStart || !termEnd) return true; // if term dates missing, include
  const sC = childStart ? new Date(childStart).getTime() : Number.NEGATIVE_INFINITY;
  const eC = childEnd ? new Date(childEnd).getTime() : Number.POSITIVE_INFINITY;
  const sT = new Date(termStart).getTime();
  const eT = new Date(termEnd).getTime();
  return sC <= eT && eC >= sT;
}

export async function GET(req: NextRequest) {
  const sb = getSb();

  // auth
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // params
  const url = new URL(req.url);
  const nurseryId = (url.searchParams.get("nursery_id") || "").trim();
  const termName = (url.searchParams.get("term_name") || "").trim();
  const includeArchived = url.searchParams.get("include_archived") === "1";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nursery_id is required" },
      { status: 400 }
    );
  }

  // 1) resolve term (prefer name; else current)
  let term: TermRow | null = null;
  if (termName) {
    const { data, error } = await sb
      .from("funding_terms")
      .select("id, name, start_date, end_date")
      .eq("nursery_id", nurseryId)
      .eq("name", termName)
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    term = data ?? null;
  }
  if (!term) {
    const { data, error } = await sb
      .from("funding_terms")
      .select("id, name, start_date, end_date, is_current")
      .eq("nursery_id", nurseryId)
      .eq("is_current", true)
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    term = (data as TermRow) ?? null;
  }

  const termStart = toISO(term?.start_date);
  const termEnd = toISO(term?.end_date);

  // 2) fetch children for nursery (we’ll filter in JS for overlap + funded hours)
  const childQuery = sb
    .from("children")
    .select(
      `
      id, first_name, last_name,
      date_of_birth, start_date, end_date, status,
      parent1_nis,
      funded_hours_per_week, stretch,
      updated_at
    `
    )
    .eq("nursery_id", nurseryId);

  if (!includeArchived) childQuery.neq("status", "archived" as any);

  const { data: children, error: childErr } = await childQuery;
  if (childErr)
    return NextResponse.json({ error: childErr.message }, { status: 500 });

  // in-memory filter: active in term + funded_hours 15 or 30
  const eligible = (children ?? []).filter((c) => {
    const hours = Number(c.funded_hours_per_week ?? 0);
    const hasFunding = hours === 15 || hours === 30;
    const inTerm = overlapsTerm(
      toISO(c.start_date),
      toISO(c.end_date),
      termStart,
      termEnd
    );
    // optional search
    const matchesQ =
      !q ||
      `${c.first_name ?? ""} ${c.last_name ?? ""}`
        .toLowerCase()
        .includes(q);
    return hasFunding && inTerm && matchesQ;
  });

  const childIds = eligible.map((c) => c.id);

  // 3) latest funding code per child
  let latestCodeByChild = new Map<string, any>();
  if (childIds.length) {
    const { data: codes, error: codeErr } = await sb
      .from("funding_codes")
      .select("id, child_id, code, status, valid_from, expiry_date, created_at")
      .in("child_id", childIds);
    if (codeErr)
      return NextResponse.json({ error: codeErr.message }, { status: 500 });

    for (const c of codes ?? []) {
      const prev = latestCodeByChild.get(c.child_id);
      // prefer the one with the latest expiry_date; fall back to created_at
      const prevKey = prev
        ? prev.expiry_date ?? prev.created_at ?? ""
        : "";
      const curKey = c.expiry_date ?? c.created_at ?? "";
      if (!prev || String(curKey) > String(prevKey)) {
        latestCodeByChild.set(c.child_id, c);
      }
    }
  }

  // 4) compose rows
  const items = eligible
    .map((c) => {
      const code = latestCodeByChild.get(c.id);
      return {
        child_id: c.id,
        child_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        date_of_birth: c.date_of_birth,
        // docs are not joined here; UI still supports badges off the row (default "missing")
        code: code?.code ?? null,
        code_status: code?.status ?? null,
        code_valid_from: code?.valid_from ?? null,
        code_valid_to: code?.expiry_date ?? null,
        applicant_ni_number: (c as any).parent1_nis ?? null,
        hours_per_week: c.funded_hours_per_week ?? null,
        weeks: null, // not tracked here
        stretch: c.stretch ?? null,
        updated_at: c.updated_at ?? null,
      };
    })
    // sort by name
    .sort((a, b) => a.child_name.localeCompare(b.child_name));

  return NextResponse.json({
    items,
    term_id: term?.id ?? null,
    term_name: term?.name ?? null,
    term_start: termStart,
    term_end: termEnd,
  });
}

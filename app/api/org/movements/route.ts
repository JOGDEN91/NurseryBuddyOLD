// app/api/org/movements/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
      },
    }
  );
}

function toDate(d?: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

function betweenInclusive(d: Date, start: Date, end: Date) {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function monthsBetween(dobIso?: string | null, refIso?: string | null): number {
  if (!dobIso || !refIso) return -1;
  const d = new Date(dobIso);
  const r = new Date(refIso);
  if (isNaN(d.getTime()) || isNaN(r.getTime())) return -1;
  let y = r.getFullYear() - d.getFullYear();
  let m = r.getMonth() - d.getMonth();
  if (r.getDate() < d.getDate()) m -= 1;
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return y * 12 + m;
}

function computePills(flags: { WP: boolean; D2: boolean }, dobIso: string | null, startIso: string): string[] {
  const ageM = monthsBetween(dobIso, startIso);
  if (ageM < 0) return [];
  const { WP, D2 } = flags;
  const pills: string[] = [];

  if (ageM < 9 || ageM >= 60) return pills;

  if (ageM < 36 && WP && !D2) return ["WP30"];

  if (ageM < 24) {
    if (WP) return ["WP30"];
    return [];
  }
  if (ageM < 36) {
    if (D2 && WP) return ["D215", "WP15"];
    if (D2) return ["D215"];
    return [];
  }
  // 3–4
  return WP ? ["U15", "WP15"] : ["U15"];
}

function pillsKey(pills: string[]) {
  return pills.length ? pills.join(" + ") : "—";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const termId = url.searchParams.get("term_id");
  if (!termId) {
    return NextResponse.json({ ok: false, error: "Missing term_id" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user.id);

  const orgId =
    (grants ?? []).find(
      (g: any) => (g.role ?? "").toUpperCase() === "ORG_ADMIN" && g.org_id
    )?.org_id ?? null;

  if (!orgId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name, la_id")
    .eq("organisation_id", orgId);

  const nurseryList = (nurseries ?? []) as Array<{ id: string; name: string; la_id: string | null }>;
  const nurseryNameById = new Map(nurseryList.map((n) => [n.id, n.name]));

  // Term for the selected id (single LA)
  const { data: term, error: termErr } = await supabase
    .from("la_term_dates")
    .select("id, la_id, term_name, start_date, end_date")
    .eq("id", termId)
    .maybeSingle();

  if (termErr || !term) {
    return NextResponse.json({ ok: false, error: termErr?.message || "Term not found" }, { status: 404 });
  }

  const start = toDate(term.start_date);
  const end = toDate(term.end_date);
  if (!start || !end) {
    return NextResponse.json({ ok: false, error: "Term dates not set" }, { status: 400 });
  }

  // Previous term start (same LA) for funding-change comparisons
  const { data: prevTerm } = await supabase
    .from("la_term_dates")
    .select("id, start_date, end_date")
    .eq("la_id", term.la_id)
    .lt("end_date", term.start_date)
    .order("end_date", { ascending: false })
    .limit(1);

  const prevStartIso = prevTerm?.[0]?.start_date ?? null;

  // Children across org
  const nurseryIds = nurseryList.map((n) => n.id);
  const { data: children, error: childErr } = await supabase
    .from("children")
    .select("id, nursery_id, first_name, last_name, date_of_birth, start_date, end_date, claim_working_parent, claim_disadvantaged2")
    .in("nursery_id", nurseryIds);

  if (childErr) {
    return NextResponse.json({ ok: false, error: childErr.message }, { status: 500 });
  }

  const starting: any[] = [];
  const leaving: any[] = [];
  const changes: any[] = [];

  // Only include nurseries matching the term LA (safe default)
  const allowedNurseryIds = new Set(
    nurseryList.filter((n) => n.la_id && n.la_id === term.la_id).map((n) => n.id)
  );

  for (const c of (children ?? []) as any[]) {
    const nurseryId = c.nursery_id as string;
    if (!allowedNurseryIds.has(nurseryId)) continue;

    const nurseryName = nurseryNameById.get(nurseryId) ?? "Nursery";
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed";

    const s = toDate(c.start_date);
    if (s && betweenInclusive(s, start, end)) {
      starting.push({
        child_id: c.id,
        child_name: name,
        nursery_id: nurseryId,
        nursery_name: nurseryName,
        date: c.start_date,
      });
    }

    const e = toDate(c.end_date);
    if (e && betweenInclusive(e, start, end)) {
      leaving.push({
        child_id: c.id,
        child_name: name,
        nursery_id: nurseryId,
        nursery_name: nurseryName,
        date: c.end_date,
      });
    }

    if (prevStartIso) {
      const flags = { WP: !!c.claim_working_parent, D2: !!c.claim_disadvantaged2 };
      const prev = pillsKey(computePills(flags, c.date_of_birth ?? null, prevStartIso));
      const next = pillsKey(computePills(flags, c.date_of_birth ?? null, term.start_date));

      if (prev !== next) {
        const prevAgeM = monthsBetween(c.date_of_birth, prevStartIso);
        const nextAgeM = monthsBetween(c.date_of_birth, term.start_date);

        let reason = "Eligibility change";
        if (prevAgeM >= 0 && nextAgeM >= 0) {
          if (prevAgeM < 36 && nextAgeM >= 36) reason = "Turns 3 (Universal begins)";
          if (prevAgeM >= 24 && prevAgeM < 36 && nextAgeM >= 36 && flags.D2) reason = "Turns 3 (D2 ends)";
        }

        changes.push({
          child_id: c.id,
          child_name: name,
          nursery_id: nurseryId,
          nursery_name: nurseryName,
          from: prev,
          to: next,
          reason,
        });
      }
    }
  }

  // sort for readability
  starting.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  leaving.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return NextResponse.json({
    ok: true,
    term: {
      id: term.id,
      label: term.term_name,
      start_date: term.start_date,
      end_date: term.end_date,
      prev_start_date: prevStartIso,
    },
    counts: {
      starting: starting.length,
      leaving: leaving.length,
      changes: changes.length,
    },
    starting,
    leaving,
    changes,
  });
}
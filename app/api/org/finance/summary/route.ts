// app/api/org/finance/summary/route.ts
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
        set() {},
        remove() {},
      },
    }
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function apiGET(req: Request, path: string, params?: Record<string, string>) {
  const origin = new URL(req.url).origin;
  const url = new URL(path, origin);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const cookieHeader = req.headers.get("cookie") ?? "";
  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

/** -------- copied from FinanceClient (date + band + entitlement logic) -------- */
function normISO(s?: string | null): string | null {
  if (!s) return null;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return v;
}

function monthsBetween(dobIso?: string | null, refIso?: string | null): number {
  const dIso = normISO(dobIso);
  const rIso = normISO(refIso);
  if (!dIso || !rIso) return -1;
  const d = new Date(dIso);
  const r = new Date(rIso);
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return -1;
  let y = r.getFullYear() - d.getFullYear();
  let m = r.getMonth() - d.getMonth();
  if (r.getDate() < d.getDate()) m -= 1;
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return y * 12 + m;
}

function computeBand(WP: boolean, D2: boolean, dobIso: string | null, laStartIso: string | null): 0 | 15 | 30 {
  const ageM = monthsBetween(dobIso, laStartIso);
  if (ageM < 0 || ageM < 9 || ageM >= 60) return 0;
  if (ageM < 24) return WP ? 30 : 0;
  if (ageM < 36) return WP && D2 ? 30 : WP ? 30 : D2 ? 15 : 0;
  return WP ? 30 : 15;
}

function annualFromBand(band: 0 | 15 | 30): 0 | 570 | 1140 {
  if (band === 30) return 1140;
  if (band === 15) return 570;
  return 0;
}

function stretchedWeeklyFromBand(band: 0 | 15 | 30, stretchedWeeks: number): number {
  const weeks = Math.max(1, Number(stretchedWeeks || 0));
  const annual = annualFromBand(band);
  return annual === 0 ? 0 : annual / weeks;
}

function amountFromWeekly(weekly: number, stretchedWeeks: number, mode: "monthly" | "termly") {
  const w = Math.max(1, Number(stretchedWeeks || 0));
  return mode === "termly" ? (weekly * w) / 3 : (weekly * w) / 12;
}

type AgeSegment = "9_23" | "2" | "3_4" | null;
function getAgeSegment(ageM: number): AgeSegment {
  if (ageM < 0) return null;
  if (ageM < 24) return "9_23";
  if (ageM < 36) return "2";
  if (ageM < 60) return "3_4";
  return null;
}

type Entitlement = {
  id: string;
  name: string;
  code: string | null;
  hours_per_week: number | null;
  is_active: boolean | null;
};

function matchSegment(e: Entitlement, seg: AgeSegment): boolean {
  if (!seg) return true;
  const code = (e.code || "").toUpperCase();
  const name = (e.name || "").toUpperCase();
  const text = `${code} ${name}`;

  switch (seg) {
    case "9_23":
      return /9[_–\-]?23|9\s*–\s*23|9\s*TO\s*23/.test(text);
    case "2":
      return /(_2\b|\b2Y|\bAGE 2|\bTWO YEAR)/.test(text);
    case "3_4":
      return /3[_–\-]?4|3\s*–\s*4|3\s*TO\s*4|\b3-4\b|\bAGE 3-4/.test(text);
    default:
      return true;
  }
}

function typeScore(e: Entitlement, WP: boolean, D2: boolean): number {
  const code = (e.code || "").toUpperCase();
  const name = (e.name || "").toUpperCase();
  const text = `${code} ${name}`;

  const isWP = text.includes("WP") || text.includes("WORKING");
  const isD2 = text.includes("D2") || text.includes("DISADV");

  if (!WP && !D2) {
    if (!isWP && !isD2) return 3;
    if (!isWP && isD2) return 1;
    if (isWP && !isD2) return 1;
    return 0;
  }
  if (WP && !D2) {
    if (isWP && !isD2) return 4;
    if (isWP && isD2) return 3;
    if (!isWP && !isD2) return 2;
    return 1;
  }
  if (!WP && D2) {
    if (isD2 && !isWP) return 4;
    if (isD2 && isWP) return 3;
    if (!isD2 && !isWP) return 2;
    return 1;
  }
  if (isWP && isD2) return 5;
  if (isWP || isD2) return 3;
  return 1;
}

function selectEntitlementForChild(
  ents: Entitlement[],
  band: 0 | 15 | 30,
  ageM: number,
  flags: { WP: boolean; D2: boolean }
): Entitlement | null {
  if (band === 0 || ageM < 0) return null;
  const seg = getAgeSegment(ageM);
  if (!seg) return null;

  const base = ents.filter((e) => {
    if (e.is_active === false) return false;
    if (Number(e.hours_per_week ?? 0) !== band) return false;
    return true;
  });
  if (!base.length) return null;

  let candidates = base.filter((e) => matchSegment(e, seg));
  if (!candidates.length) candidates = base;

  let best: Entitlement | null = null;
  let bestScore = 0;
  for (const e of candidates) {
    const score = typeScore(e, flags.WP, flags.D2);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** ---------- season label from LA term anchor ---------- */
function extractSeason(label: string | null | undefined): "Autumn" | "Spring" | "Summer" | null {
  const t = String(label ?? "").trim();
  if (!t) return null;

  const m = t.match(/\((autumn|spring|summer)\)/i);
  if (m?.[1]) {
    const s = m[1].toLowerCase();
    return s === "autumn" ? "Autumn" : s === "spring" ? "Spring" : "Summer";
  }
  if (/autumn/i.test(t)) return "Autumn";
  if (/spring/i.test(t)) return "Spring";
  if (/summer/i.test(t)) return "Summer";
  return null;
}

function academicYearStartFromIso(startIso?: string | null): number | null {
  const s = normISO(startIso);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 8 ? y : y - 1;
}

function academicYearLabel(startYear: number): string {
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

function canonical(s: any) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function weeksFromDates(startIso?: string | null, endIso?: string | null): number {
  const s = normISO(startIso);
  const e = normISO(endIso);
  if (!s || !e) return 0;
  const sd = new Date(s);
  const ed = new Date(e);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return 0;
  const days = Math.floor((ed.getTime() - sd.getTime()) / 86400000) + 1;
  return days > 0 ? Math.ceil(days / 7) : 0;
}

type Nursery = { id: string; name: string };
type TermLite = { id: string; name: string; start_date: string | null; end_date: string | null };

type EstimateRow = {
  id: string; // child id
  dob: string;
  attendedWeekly: number;
  rate: number;
  consumables: number | null; // per-term
};

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const laTermId = sp.get("term_id") ?? "";
    if (!laTermId) return NextResponse.json({ ok: false, error: "term_id is required" }, { status: 400 });

    const supabase = getSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

    const { data: grants, error: gErr } = await supabase
      .from("role_grants")
      .select("role, org_id")
      .eq("user_id", user.id);
    if (gErr) return NextResponse.json({ ok: false, error: gErr.message }, { status: 500 });

    const orgId =
      (grants ?? []).find((g: any) => String(g.role ?? "").toUpperCase() === "ORG_ADMIN")?.org_id ?? null;
    if (!orgId) return NextResponse.json({ ok: false, error: "ORG_ADMIN grant not found" }, { status: 403 });

    const { data: nurData, error: nurErr } = await supabase
      .from("nurseries")
      .select("id, name")
      .eq("organisation_id", orgId)
      .order("name", { ascending: true });
    if (nurErr) return NextResponse.json({ ok: false, error: nurErr.message }, { status: 500 });

    const nurseries: Nursery[] = (nurData ?? []) as any;
    if (!nurseries.length) {
      return NextResponse.json({ ok: true, term: { id: laTermId, label: "Selected term", start_date: null, end_date: null, weeks: 0 }, totals: {}, by_nursery: [] }, { status: 200 });
    }

    const cookieNurseryId = cookies().get("nb.nurseryId")?.value ?? null;
    const anchorNurseryId =
      cookieNurseryId && nurseries.some((n) => n.id === cookieNurseryId) ? cookieNurseryId : nurseries[0].id;

    // LA term details from /api/org/declarations (source of OrgSideNav term_id)
    const { res: decRes, json: decJson } = await apiGET(req, "/api/org/declarations", { nursery_id: anchorNurseryId });
    const laTerms: any[] = decRes.ok && Array.isArray(decJson?.terms) ? decJson.terms : [];
    const anchorLaTerm = laTerms.find((t) => String(t?.id ?? "") === String(laTermId)) ?? null;

    const laLabel = String(anchorLaTerm?.label ?? anchorLaTerm?.name ?? "Selected term");
    const laStart = normISO(anchorLaTerm?.start_date ?? anchorLaTerm?.la_start_date ?? anchorLaTerm?.starts_on ?? null);
    const laEnd = normISO(anchorLaTerm?.end_date ?? anchorLaTerm?.la_end_date ?? anchorLaTerm?.ends_on ?? null);

    const season = extractSeason(laLabel) ?? "Autumn";
    const ayStart = academicYearStartFromIso(laStart) ?? academicYearStartFromIso(laEnd) ?? new Date().getFullYear();
    const seasonLabel = `${season} ${academicYearLabel(ayStart)}`;

    // Entitlements + org rates (same sources as /org/finance)
    const { res: entRes, json: entJson } = await apiGET(req, "/api/funding-rates/entitlements");
    if (!entRes.ok || entJson?.ok === false) {
      return NextResponse.json({ ok: false, error: entJson?.error || "Failed to load entitlements" }, { status: 500 });
    }
    const entitlements: Entitlement[] = (entJson.items ?? []) as any[];

    const { res: orgRatesRes, json: orgRatesJson } = await apiGET(req, "/api/funding-rates", {
      scope: "org",
      orgId: String(orgId),
    });
    if (!orgRatesRes.ok || orgRatesJson?.ok === false) {
      return NextResponse.json({ ok: false, error: orgRatesJson?.error || "Failed to load org funding rates" }, { status: 500 });
    }
    const orgRateMap = new Map<string, number>();
    for (const r of (orgRatesJson.items ?? []) as any[]) {
      if (r?.entitlement_id && r?.rate_hour != null) orgRateMap.set(String(r.entitlement_id), Number(r.rate_hour));
    }

    // Seasonal funding_terms for all nurseries (NO starts_on/ends_on)
    const { data: allTerms, error: tErr } = await supabase
      .from("funding_terms")
      .select("id, nursery_id, name, start_date, end_date")
      .in("nursery_id", nurseries.map((n) => n.id));
    if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

    const termsByNursery = new Map<string, TermLite[]>();
    for (const row of (allTerms ?? []) as any[]) {
      const nid = String(row.nursery_id);
      const t: TermLite = {
        id: String(row.id),
        name: String(row.name ?? ""),
        start_date: normISO(row.start_date ?? null),
        end_date: normISO(row.end_date ?? null),
      };
      if (!termsByNursery.has(nid)) termsByNursery.set(nid, []);
      termsByNursery.get(nid)!.push(t);
    }

    const want = canonical(seasonLabel);
    const wantSeason = canonical(season);
    const wantYear = canonical(academicYearLabel(ayStart));
    const wantAltYear = canonical(`${ayStart}-${String(ayStart + 1).slice(-2)}`);

    function pickSeasonTerm(nurseryId: string): TermLite | null {
      const list = termsByNursery.get(nurseryId) ?? [];
      if (!list.length) return null;

      const exact = list.find((t) => canonical(t.name) === want);
      if (exact) return exact;

      const contains = list.find((t) => {
        const nm = canonical(t.name);
        const hasSeason = nm.includes(wantSeason);
        const hasYear = nm.includes(wantYear) || nm.includes(wantAltYear) || nm.includes(String(ayStart));
        return hasSeason && hasYear;
      });
      if (contains) return contains;

      return list[0] ?? null;
    }

    // Compute per nursery + also capture min/max season dates across the org
    let orgMinStart: string | null = null;
    let orgMaxEnd: string | null = null;

    const byNursery = await mapLimit(nurseries, 3, async (n) => {
      const seasonTerm = pickSeasonTerm(n.id);
      if (!seasonTerm) {
        return {
          nursery_id: n.id,
          nursery_name: n.name,
          season_term_id: null,
          season_term_name: null,
          season_start: null,
          season_end: null,
          summary: {
            childrenCount: 0,
            attendedWeekly: 0,
            fundedWeekly: 0,
            payableWeekly: 0,
            tuitionWeekly: 0,
            consPerTerm: 0,
            count15: 0,
            count30: 0,
            fundingWeeklyValue: 0,
          },
          financials: { monthly: {}, termly: {} },
          missing_rate_rows: 0,
        };
      }

      // Track org range
      if (seasonTerm.start_date && (!orgMinStart || new Date(seasonTerm.start_date) < new Date(orgMinStart))) orgMinStart = seasonTerm.start_date;
      if (seasonTerm.end_date && (!orgMaxEnd || new Date(seasonTerm.end_date) > new Date(orgMaxEnd))) orgMaxEnd = seasonTerm.end_date;

      // Effective settings via RPC (same as /org/finance)
      const { data: effRows } = await supabase.rpc("get_effective_settings", { p_nursery_id: n.id }).select("*");
      const eff = (effRows?.[0] as any) ?? null;
      const stretchedWeeks = Math.max(1, Number(eff?.stretched_weeks ?? 38));

      // Nursery rate overrides
      const { res: nurRatesRes, json: nurRatesJson } = await apiGET(req, "/api/funding-rates", {
        scope: "nursery",
        nurseryId: n.id,
      });
      const nurRateMap = new Map<string, number>();
      if (nurRatesRes.ok && nurRatesJson?.ok !== false) {
        for (const r of (nurRatesJson.items ?? []) as any[]) {
          if (r?.entitlement_id && r?.rate_hour != null) nurRateMap.set(String(r.entitlement_id), Number(r.rate_hour));
        }
      }

      // LA start for age banding
      let laStartIso: string | null = seasonTerm.start_date ?? null;
      try {
        const { res: laTermsRes, json: laTermsJson } = await apiGET(req, "/api/funding/terms", {
          nursery_id: n.id,
          all: "1",
        });
        if (laTermsRes.ok && Array.isArray(laTermsJson?.terms)) {
          const match = (laTermsJson.terms as any[]).find(
            (t: any) => (t.name || "").toLowerCase() === (seasonTerm.name || "").toLowerCase()
          );
          laStartIso = normISO(match?.la_start_date) ?? laStartIso;
        }
      } catch {
        // ignore
      }

      // Estimate rows
      const { res: estRes, json: estJson } = await apiGET(req, "/api/finance/estimate", {
        nurseryId: n.id,
        termId: seasonTerm.id,
      });
      const rows: EstimateRow[] = estRes.ok && Array.isArray(estJson?.rows) ? (estJson.rows as any[]) : [];
      const childIds = rows.map((r) => String(r?.id ?? "")).filter(Boolean);

      // Child flags
      const claimById = new Map<string, { WP: boolean; D2: boolean }>();
      if (childIds.length) {
        const { data: childRows, error: chErr } = await supabase
          .from("children")
          .select("id, claim_working_parent, claim_disadvantaged2")
          .in("id", childIds);

        if (!chErr && Array.isArray(childRows)) {
          for (const c of childRows as any[]) {
            claimById.set(String(c.id), { WP: !!c.claim_working_parent, D2: !!c.claim_disadvantaged2 });
          }
        } else {
          await mapLimit(childIds, 6, async (id) => {
            const { res, json } = await apiGET(req, `/api/children/${encodeURIComponent(id)}`);
            if (res.ok && (json as any)?.child) {
              claimById.set(id, {
                WP: !!(json as any).child.claim_working_parent,
                D2: !!(json as any).child.claim_disadvantaged2,
              });
            }
            return null;
          });
        }
      }

      // Aggregate like FinanceClient does
      let childrenCount = 0;
      let attendedWeekly = 0;
      let fundedWeekly = 0;
      let payableWeekly = 0;
      let tuitionWeekly = 0;
      let consPerTerm = 0;
      let count15 = 0;
      let count30 = 0;
      let fundingWeeklyValue = 0;
      let missing_rate_rows = 0;

      for (const r of rows) {
        childrenCount += 1;

        const attended = Number(r.attendedWeekly || 0);
        const rate = Number(r.rate || 0);
        const cons = Number(r.consumables ?? 0);

        attendedWeekly += attended;
        consPerTerm += cons;

        const flags = claimById.get(String(r.id)) ?? { WP: false, D2: false };
        const dobIso = normISO(r.dob ?? null);
        const ageM = monthsBetween(dobIso, laStartIso);

        const band = computeBand(flags.WP, flags.D2, dobIso, laStartIso);
        const fundedW = stretchedWeeklyFromBand(band, stretchedWeeks);
        const hoursPayable = Math.max(attended - fundedW, 0);
        const amountPayable = hoursPayable * rate;

        fundedWeekly += fundedW;
        payableWeekly += hoursPayable;
        tuitionWeekly += amountPayable;

        if (band === 15) count15++;
        else if (band === 30) count30++;

        const ent = selectEntitlementForChild(entitlements, band, ageM, flags);
        const fundingRate = ent ? (nurRateMap.get(ent.id) ?? orgRateMap.get(ent.id) ?? null) : null;

        if (fundedW > 0 && fundingRate == null) {
          missing_rate_rows += 1;
        }

        const fwv = fundedW * (fundingRate ?? 0);
        fundingWeeklyValue += fwv;
      }

      // Financials (sum per nursery, because stretched weeks may differ)
      const monthlyTuition = amountFromWeekly(tuitionWeekly, stretchedWeeks, "monthly");
      const monthlyCons = consPerTerm / 4;
      const monthlyTotalPayable = monthlyTuition + monthlyCons;
      const monthlyFunding = fundingWeeklyValue > 0 ? amountFromWeekly(fundingWeeklyValue, stretchedWeeks, "monthly") : 0;
      const monthlyTotalIncome = monthlyTotalPayable + monthlyFunding;

      const termlyTuition = amountFromWeekly(tuitionWeekly, stretchedWeeks, "termly");
      const termlyCons = consPerTerm;
      const termlyTotalPayable = termlyTuition + termlyCons;
      const termlyFunding = fundingWeeklyValue > 0 ? amountFromWeekly(fundingWeeklyValue, stretchedWeeks, "termly") : 0;
      const termlyTotalIncome = termlyTotalPayable + termlyFunding;

      return {
        nursery_id: n.id,
        nursery_name: n.name,
        season_term_id: seasonTerm.id,
        season_term_name: seasonTerm.name,
        season_start: seasonTerm.start_date,
        season_end: seasonTerm.end_date,
        summary: {
          childrenCount,
          attendedWeekly: round2(attendedWeekly),
          fundedWeekly: round2(fundedWeekly),
          payableWeekly: round2(payableWeekly),
          tuitionWeekly: round2(tuitionWeekly),
          consPerTerm: round2(consPerTerm),
          count15,
          count30,
          fundingWeeklyValue: round2(fundingWeeklyValue),
        },
        financials: {
          monthly: {
            tuition: round2(monthlyTuition),
            consumables: round2(monthlyCons),
            totalPayable: round2(monthlyTotalPayable),
            funding: round2(monthlyFunding),
            totalIncome: round2(monthlyTotalIncome),
          },
          termly: {
            tuition: round2(termlyTuition),
            consumables: round2(termlyCons),
            totalPayable: round2(termlyTotalPayable),
            funding: round2(termlyFunding),
            totalIncome: round2(termlyTotalIncome),
          },
        },
        missing_rate_rows,
      };
    });

    // Org totals
    const totals = byNursery.reduce(
      (acc: any, n: any) => {
        acc.childrenCount += n.summary.childrenCount || 0;
        acc.attendedWeekly += n.summary.attendedWeekly || 0;
        acc.fundedWeekly += n.summary.fundedWeekly || 0;
        acc.payableWeekly += n.summary.payableWeekly || 0;
        acc.tuitionWeekly += n.summary.tuitionWeekly || 0;
        acc.consPerTerm += n.summary.consPerTerm || 0;
        acc.count15 += n.summary.count15 || 0;
        acc.count30 += n.summary.count30 || 0;
        acc.fundingWeeklyValue += n.summary.fundingWeeklyValue || 0;
        acc.missing_rate_rows += n.missing_rate_rows || 0;

        acc.financials.monthly.tuition += n.financials.monthly.tuition || 0;
        acc.financials.monthly.consumables += n.financials.monthly.consumables || 0;
        acc.financials.monthly.totalPayable += n.financials.monthly.totalPayable || 0;
        acc.financials.monthly.funding += n.financials.monthly.funding || 0;
        acc.financials.monthly.totalIncome += n.financials.monthly.totalIncome || 0;

        acc.financials.termly.tuition += n.financials.termly.tuition || 0;
        acc.financials.termly.consumables += n.financials.termly.consumables || 0;
        acc.financials.termly.totalPayable += n.financials.termly.totalPayable || 0;
        acc.financials.termly.funding += n.financials.termly.funding || 0;
        acc.financials.termly.totalIncome += n.financials.termly.totalIncome || 0;

        return acc;
      },
      {
        childrenCount: 0,
        attendedWeekly: 0,
        fundedWeekly: 0,
        payableWeekly: 0,
        tuitionWeekly: 0,
        consPerTerm: 0,
        count15: 0,
        count30: 0,
        fundingWeeklyValue: 0,
        missing_rate_rows: 0,
        financials: {
          monthly: { tuition: 0, consumables: 0, totalPayable: 0, funding: 0, totalIncome: 0 },
          termly: { tuition: 0, consumables: 0, totalPayable: 0, funding: 0, totalIncome: 0 },
        },
      }
    );

    // Use org min/max season term dates for display (this is also how we’ll reveal the 01/08 source)
    const displayStart = orgMinStart ?? laStart ?? null;
    const displayEnd = orgMaxEnd ?? laEnd ?? null;
    const displayWeeks = weeksFromDates(displayStart, displayEnd);

    return NextResponse.json(
      {
        ok: true,
        term: {
          id: laTermId,
          label: seasonLabel,
          start_date: displayStart,
          end_date: displayEnd,
          weeks: displayWeeks,
        },
        totals: {
          childrenCount: totals.childrenCount,
          attendedWeekly: round2(totals.attendedWeekly),
          fundedWeekly: round2(totals.fundedWeekly),
          payableWeekly: round2(totals.payableWeekly),
          tuitionWeekly: round2(totals.tuitionWeekly),
          consPerTerm: round2(totals.consPerTerm),
          count15: totals.count15,
          count30: totals.count30,
          fundingWeeklyValue: round2(totals.fundingWeeklyValue),
          missing_rate_rows: totals.missing_rate_rows,
        },
        financials: {
          monthly: {
            tuition: round2(totals.financials.monthly.tuition),
            consumables: round2(totals.financials.monthly.consumables),
            totalPayable: round2(totals.financials.monthly.totalPayable),
            funding: round2(totals.financials.monthly.funding),
            totalIncome: round2(totals.financials.monthly.totalIncome),
          },
          termly: {
            tuition: round2(totals.financials.termly.tuition),
            consumables: round2(totals.financials.termly.consumables),
            totalPayable: round2(totals.financials.termly.totalPayable),
            funding: round2(totals.financials.termly.funding),
            totalIncome: round2(totals.financials.termly.totalIncome),
          },
        },
        by_nursery: byNursery,
        debug: {
          term_sources: {
            la_anchor_label: laLabel,
            la_anchor_start: laStart,
            la_anchor_end: laEnd,
            org_min_season_start: orgMinStart,
            org_max_season_end: orgMaxEnd,
            // If you see 2025-08-01 here, you know the exact source is a nursery seasonal term record.
            nursery_season_terms: byNursery.map((n: any) => ({
              nursery_id: n.nursery_id,
              nursery_name: n.nursery_name,
              season_term_name: n.season_term_name,
              season_start: n.season_start,
              season_end: n.season_end,
            })),
          },
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
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
        remove: (n, o) =>
          cookieStore.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (x: string | null | undefined) => (x ? new Date(x) : null);

export async function GET(req: NextRequest) {
  const supabase = getSupabaseRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const nurseryId = searchParams.get("nurseryId");
  const explicitTermId = searchParams.get("termId");
  if (!nurseryId)
    return NextResponse.json({ error: "Missing nurseryId" }, { status: 400 });

  // pull terms
  const { data: termRows, error: tErr } = await supabase
    .from("funding_terms")
    .select("*")
    .eq("nursery_id", nurseryId)
    .order("start_date", { ascending: true });
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  const terms: Term[] = (termRows ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    nursery_id: t.nursery_id,
    start_date: t.start_date ?? t.starts_on ?? null,
    end_date: t.end_date ?? t.ends_on ?? null,
  }));

  const now = new Date();
  const current =
    terms.find(
      (t) =>
        t.start_date &&
        t.end_date &&
        new Date(t.start_date) <= now &&
        now <= new Date(t.end_date)
    ) ?? null;

  let selected: Term | null = null;
  if (explicitTermId) selected = terms.find((t) => t.id === explicitTermId) ?? null;
  if (!selected) selected = current ?? terms[0] ?? null;

  // effective settings
  const { data: eff, error: sErr } = await supabase
    .rpc("get_effective_settings", { p_nursery_id: nurseryId })
    .select("*");
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  const S = eff?.[0] ?? null;
  const weeks = Math.max(1, Number(S?.stretched_weeks ?? 38));
  const baseRate = Number(S?.hourly_rate ?? 0); // private rate
  const addlRate = Number(S?.additional_hourly_rate ?? baseRate); // top-up when funded
  const fundingHourlyRate = Number(S?.funding_hourly_rate ?? 0); // LA rate (for Financials card only)
  const CAP15 = Number(S?.annual_cap_15 ?? 570);
  const CAP30 = Number(S?.annual_cap_30 ?? 1140);

  // children
  const { data: kids, error: cErr } = await supabase
    .from("children")
    .select("*")
    .eq("nursery_id", nurseryId);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

  // filter by overlap
  const overlapFilter = (list: any[], term: Term | null) => {
    if (!term) return list;
    const s = toDate(term.start_date);
    const e = toDate(term.end_date);
    return list.filter((c) => {
      const cs = toDate(c.start_date);
      const ce = toDate(c.end_date);
      const csOK = !cs || !e || cs <= e;
      const ceOK = !ce || !s || ce >= s;
      return csOK && ceOK;
    });
  };
  const filtered = overlapFilter(kids ?? [], selected);

  // get org id for nursery
  const { data: nurseryRow } = await supabase
    .from("nurseries")
    .select("organisation_id")
    .eq("id", nurseryId)
    .maybeSingle();
  const orgId = nurseryRow?.organisation_id ?? null;

  // --------- Consumables (override-first) ----------
  // NOTE: new schema uses amount_15 and amount_30 (per term).
  // Nursery-specific amount takes precedence; if missing, fall back to org amount.
  const { data: orgCons } = orgId
    ? await supabase
        .from("org_consumables")
        .select("id, description, amount_15, amount_30")
        .eq("org_id", orgId)
    : { data: [] as any[] };

  const { data: nurCons } = await supabase
    .from("nursery_consumables")
    .select("id, description, amount_15, amount_30")
    .eq("nursery_id", nurseryId);

  const allOrg = (orgCons ?? []) as Array<{
    id: string;
    description: string;
    amount_15: number | null;
    amount_30: number | null;
  }>;
  const allNur = (nurCons ?? []) as Array<{
    id: string;
    description: string;
    amount_15: number | null;
    amount_30: number | null;
  }>;

  // opt-outs
  const childIds = (kids ?? []).map((c: any) => c.id);
  const { data: optouts } = childIds.length
    ? await supabase
        .from("child_consumable_optouts")
        .select("child_id, scope, consumable_id")
        .in("child_id", childIds)
    : { data: [] as any[] };

  const optedOut = new Set(
    (optouts ?? []).map((o: any) => `${o.child_id}:${o.scope}:${o.consumable_id}`)
  );

  // helper to pick the banded amount from a row
  function bandAmount(
    row: { amount_15: number | null; amount_30: number | null } | null | undefined,
    band: 15 | 30
  ): number | null {
    if (!row) return null;
    const v = band === 15 ? row.amount_15 : row.amount_30;
    return v == null ? null : Number(v);
  }

  // utility: normalize funded band for a child from funded_hours_per_week
  function fundedBand(child: any): 0 | 15 | 30 {
    const raw = Number(child?.funded_hours_per_week ?? 0);
    if (raw >= 30) return 30;
    if (raw >= 15) return 15;
    return 0;
  }

  // build rows
  const rowsFrom = (list: any[]) =>
    list.map((c: any) => {
      const attended =
        (typeof c.hours_mon === "number" ? c.hours_mon : 0) +
        (typeof c.hours_tue === "number" ? c.hours_tue : 0) +
        (typeof c.hours_wed === "number" ? c.hours_wed : 0) +
        (typeof c.hours_thu === "number" ? c.hours_thu : 0) +
        (typeof c.hours_fri === "number" ? c.hours_fri : 0);
      const attendedWeekly = round2(attended);

      const childBand = fundedBand(c);

      // funded weekly from annual cap / stretched weeks
      const cap = childBand === 30 ? CAP30 : childBand === 15 ? CAP15 : 0;
      const fundedWeekly = cap > 0 ? round2(cap / weeks) : 0;

      // Fees charged to parents:
      // 0 funded -> hourly_rate; 15/30 -> additional_hourly_rate
      const rate = childBand > 0 ? addlRate : baseRate;

      const hoursPayable = Math.max(0, round2(attendedWeekly - fundedWeekly));
      const amountPayable = round2(hoursPayable * rate); // WEEKLY tuition

      // per-term consumables:
      // only for children with funded hours (15/30). Nursery amount overrides org amount.
      let consTerm = 0;
      if (childBand === 15 || childBand === 30) {
        // ORG rows
        for (const oc of allOrg) {
          if (optedOut.has(`${c.id}:org:${oc.id}`)) continue;
          const orgBandAmt = bandAmount(oc, childBand);
          // check if there is a nursery row with the same description to override
          const nMatch = allNur.find((n) => n.description?.trim().toLowerCase() === oc.description?.trim().toLowerCase());
          const nurBandAmt = bandAmount(nMatch, childBand);
          const use = nurBandAmt != null ? nurBandAmt : orgBandAmt;
          if (use != null) consTerm += Number(use);
        }
        // NURSERY-only rows that don’t exist at org level
        for (const nc of allNur) {
          if (optedOut.has(`${c.id}:nursery:${nc.id}`)) continue;
          const hasOrg = allOrg.some(
            (o) => o.description?.trim().toLowerCase() === nc.description?.trim().toLowerCase()
          );
          if (hasOrg) continue; // already handled via override logic above
          const nurBandAmt = bandAmount(nc, childBand);
          if (nurBandAmt != null) consTerm += Number(nurBandAmt);
        }
      }
      consTerm = round2(consTerm);

      const childName =
        `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—";
      const parentName = c.parent1_name ?? "—";
      const parentEmail = c.parent1_email ?? "—";
      const dobSrc = c.date_of_birth ?? c.dob ?? null;
      const dob = dobSrc ? new Date(dobSrc).toLocaleDateString("en-GB") : "—";

      return {
        id: c.id,
        childName,
        dob,
        parentName,
        parentEmail,
        attendedWeekly,
        fundedWeekly,
        hoursPayable,
        rate,
        amountPayable, // weekly
        consumables: consTerm, // per-term
        total: amountPayable,
      };
    });

  let rows = rowsFrom(filtered);
  if (rows.length === 0 && (kids ?? []).length > 0) {
    rows = rowsFrom(kids ?? []);
  }

  return NextResponse.json({
    selectedTermId: selected?.id ?? null,
    terms,
    rows,
    invoiceMode: S?.invoice_mode ?? "monthly",
    weeks,
    // Expose LA rate for the Financials summary card (not used for fee rate)
    fundingHourlyRate,
  });
}

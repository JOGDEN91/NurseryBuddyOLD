// app/api/settings/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
  };
}

type InvoiceMode = "monthly" | "termly";
type DeclarationMode = "one_off" | "termly";

type OrgSettingsRow = {
  organisation_id: string | null;
  invoice_mode: InvoiceMode | null;
  hourly_rate: number | null;
  additional_hourly_rate: number | null;
  stretched_weeks: number | null;
  financial_year_end: string | null;
  annual_cap_15: number | null;
  annual_cap_30: number | null;
};

type NurserySettingsRow = {
  nursery_id: string;
  invoice_mode: InvoiceMode | null;
  hourly_rate: number | null;
  additional_hourly_rate: number | null;
  stretched_weeks: number | null;
  financial_year_end: string | null;
  annual_cap_15: number | null;
  annual_cap_30: number | null;
  declaration_mode: DeclarationMode | null;
  declaration_lead_days: number | null;
  declaration_intro_text: string | null;
  declaration_reconfirm_text: string | null;
  declaration_privacy_text: string | null;
  declaration_privacy_url: string | null;
};

function mergeEffective(
  orgRow: OrgSettingsRow | null,
  nurRow: NurserySettingsRow | null,
  orgId: string | null,
  nurseryId: string
) {
  const invoice_mode: InvoiceMode =
    (nurRow?.invoice_mode as InvoiceMode | null) ||
    (orgRow?.invoice_mode as InvoiceMode | null) ||
    "monthly";

  const stretched_weeks =
    nurRow?.stretched_weeks ??
    orgRow?.stretched_weeks ??
    38;

  const financial_year_end =
    nurRow?.financial_year_end ?? orgRow?.financial_year_end ?? null;

  const annual_cap_15 =
    nurRow?.annual_cap_15 ?? orgRow?.annual_cap_15 ?? 570;

  const annual_cap_30 =
    nurRow?.annual_cap_30 ?? orgRow?.annual_cap_30 ?? 1140;

  const hourly_rate =
    nurRow?.hourly_rate ?? orgRow?.hourly_rate ?? 0;

  const additional_hourly_rate =
    nurRow?.additional_hourly_rate ??
    orgRow?.additional_hourly_rate ??
    0;

  const declaration_mode: DeclarationMode =
    (nurRow?.declaration_mode as DeclarationMode | null) || "termly";

  const declaration_lead_days =
    nurRow?.declaration_lead_days ?? 28;

  // For now these are only per-nursery; if we add LA-level defaults later,
  // we can add a fallback chain here.
  const declaration_intro_text =
    nurRow?.declaration_intro_text ?? null;
  const declaration_reconfirm_text =
    nurRow?.declaration_reconfirm_text ?? null;
  const declaration_privacy_text =
    nurRow?.declaration_privacy_text ?? null;
  const declaration_privacy_url =
    nurRow?.declaration_privacy_url ?? null;

  return {
    org_id: orgId,
    nursery_id: nurseryId,
    invoice_mode,
    hourly_rate,
    additional_hourly_rate,
    stretched_weeks,
    financial_year_end,
    annual_cap_15,
    annual_cap_30,
    funding_hourly_rate: null,
    declaration_mode,
    declaration_lead_days,
    declaration_intro_text,
    declaration_reconfirm_text,
    declaration_privacy_text,
    declaration_privacy_url,
  };
}

function getSearchParams(req: Request) {
  const idx = req.url.indexOf("?");
  const query = idx === -1 ? "" : req.url.slice(idx + 1);
  return new URLSearchParams(query);
}

export async function GET(req: Request) {
  try {
    const supa = createServerClient(URL_BASE, ANON, { cookies: cookieBridge() });
    const admin = createClient(URL_BASE, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const params = getSearchParams(req);
    const scope = params.get("scope");
    const nurseryId = params.get("nurseryId");
    const orgId = params.get("orgId");

    // 1) Organisation-only settings (for org admin UI)
    if (scope === "org") {
      if (!orgId) {
        return NextResponse.json(
          { ok: false, error: "orgId is required for org scope" },
          { status: 400 }
        );
      }

      const { data, error } = await supa
        .from("org_settings")
        .select(
          `
          organisation_id,
          invoice_mode,
          hourly_rate,
          additional_hourly_rate,
          stretched_weeks,
          financial_year_end,
          annual_cap_15,
          annual_cap_30
        `
        )
        .eq("organisation_id", orgId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: true, settings: data ?? null },
        { status: 200 }
      );
    }

    // 2) Nursery-only settings (raw row for org UI)
    if (scope === "nursery") {
      if (!nurseryId) {
        return NextResponse.json(
          { ok: false, error: "nurseryId is required for nursery scope" },
          { status: 400 }
        );
      }

      const { data, error } = await supa
        .from("nursery_settings")
        .select(
          `
          nursery_id,
          invoice_mode,
          hourly_rate,
          additional_hourly_rate,
          stretched_weeks,
          financial_year_end,
          annual_cap_15,
          annual_cap_30,
          declaration_mode,
          declaration_lead_days,
          declaration_intro_text,
          declaration_reconfirm_text,
          declaration_privacy_text,
          declaration_privacy_url
        `
        )
        .eq("nursery_id", nurseryId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: true, settings: data ?? null },
        { status: 200 }
      );
    }

    // 3) Effective settings for a nursery (used by parent app, invoices, declarations)
    if (nurseryId) {
      // Use service-role client here to avoid RLS issues for parents
      const { data: nurseryRow, error: nErr } = await admin
        .from("nurseries")
        .select("id, organisation_id")
        .eq("id", nurseryId)
        .maybeSingle();

      if (nErr || !nurseryRow) {
        return NextResponse.json(
          { ok: false, error: "Nursery not found" },
          { status: 404 }
        );
      }

      const effectiveOrgId = nurseryRow.organisation_id as string | null;

      const { data: orgRowRaw } = effectiveOrgId
        ? await admin
            .from("org_settings")
            .select(
              `
              organisation_id,
              invoice_mode,
              hourly_rate,
              additional_hourly_rate,
              stretched_weeks,
              financial_year_end,
              annual_cap_15,
              annual_cap_30
            `
            )
            .eq("organisation_id", effectiveOrgId)
            .maybeSingle()
        : { data: null as OrgSettingsRow | null };

      const { data: nurRowRaw } = await admin
        .from("nursery_settings")
        .select(
          `
          nursery_id,
          invoice_mode,
          hourly_rate,
          additional_hourly_rate,
          stretched_weeks,
          financial_year_end,
          annual_cap_15,
          annual_cap_30,
          declaration_mode,
          declaration_lead_days,
          declaration_intro_text,
          declaration_reconfirm_text,
          declaration_privacy_text,
          declaration_privacy_url
        `
        )
        .eq("nursery_id", nurseryId)
        .maybeSingle();

      const eff = mergeEffective(
        (orgRowRaw as OrgSettingsRow | null) ?? null,
        (nurRowRaw as NurserySettingsRow | null) ?? null,
        effectiveOrgId,
        nurseryId
      );

      return NextResponse.json({ ok: true, settings: eff }, { status: 200 });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid settings query" },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("/api/settings GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const supa = createServerClient(URL_BASE, ANON, { cookies: cookieBridge() });

    const body = await req.json().catch(() => ({} as any));
    const scope = body.scope as "org" | "nursery" | undefined;

    if (!scope) {
      return NextResponse.json(
        { ok: false, error: "scope is required" },
        { status: 400 }
      );
    }

    if (scope === "org") {
      const orgId = (body.org_id as string | undefined) ?? null;
      if (!orgId) {
        return NextResponse.json(
          { ok: false, error: "org_id is required for org scope" },
          { status: 400 }
        );
      }

      const updates: Partial<OrgSettingsRow> = {
        organisation_id: orgId,
      };

      if (body.invoice_mode === "monthly" || body.invoice_mode === "termly") {
        updates.invoice_mode = body.invoice_mode;
      }
      if (body.hourly_rate === null || typeof body.hourly_rate === "number") {
        updates.hourly_rate = body.hourly_rate;
      }
      if (
        body.additional_hourly_rate === null ||
        typeof body.additional_hourly_rate === "number"
      ) {
        updates.additional_hourly_rate = body.additional_hourly_rate;
      }
      if (
        body.stretched_weeks === null ||
        typeof body.stretched_weeks === "number"
      ) {
        updates.stretched_weeks = body.stretched_weeks;
      }
      if (
        body.financial_year_end === null ||
        typeof body.financial_year_end === "string"
      ) {
        updates.financial_year_end = body.financial_year_end;
      }
      if (body.annual_cap_15 === null || typeof body.annual_cap_15 === "number") {
        updates.annual_cap_15 = body.annual_cap_15;
      }
      if (body.annual_cap_30 === null || typeof body.annual_cap_30 === "number") {
        updates.annual_cap_30 = body.annual_cap_30;
      }

      const { error } = await supa
        .from("org_settings")
        .upsert(updates, { onConflict: "organisation_id" });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (scope === "nursery") {
      const nurseryId = (body.nursery_id as string | undefined) ?? null;
      if (!nurseryId) {
        return NextResponse.json(
          { ok: false, error: "nursery_id is required for nursery scope" },
          { status: 400 }
        );
      }

      const updates: Partial<NurserySettingsRow> = {
        nursery_id: nurseryId,
      };

      if (body.invoice_mode === "monthly" || body.invoice_mode === "termly") {
        updates.invoice_mode = body.invoice_mode;
      }
      if (body.hourly_rate === null || typeof body.hourly_rate === "number") {
        updates.hourly_rate = body.hourly_rate;
      }
      if (
        body.additional_hourly_rate === null ||
        typeof body.additional_hourly_rate === "number"
      ) {
        updates.additional_hourly_rate = body.additional_hourly_rate;
      }
      if (
        body.stretched_weeks === null ||
        typeof body.stretched_weeks === "number"
      ) {
        updates.stretched_weeks = body.stretched_weeks;
      }
      if (
        body.financial_year_end === null ||
        typeof body.financial_year_end === "string"
      ) {
        updates.financial_year_end = body.financial_year_end;
      }
      if (body.annual_cap_15 === null || typeof body.annual_cap_15 === "number") {
        updates.annual_cap_15 = body.annual_cap_15;
      }
      if (body.annual_cap_30 === null || typeof body.annual_cap_30 === "number") {
        updates.annual_cap_30 = body.annual_cap_30;
      }

      if (
        body.declaration_mode === "one_off" ||
        body.declaration_mode === "termly"
      ) {
        updates.declaration_mode = body.declaration_mode;
      }

      if (
        body.declaration_lead_days === null ||
        typeof body.declaration_lead_days === "number"
      ) {
        updates.declaration_lead_days = body.declaration_lead_days;
      }

      if (
        body.declaration_intro_text === null ||
        typeof body.declaration_intro_text === "string"
      ) {
        updates.declaration_intro_text = body.declaration_intro_text;
      }
      if (
        body.declaration_reconfirm_text === null ||
        typeof body.declaration_reconfirm_text === "string"
      ) {
        updates.declaration_reconfirm_text = body.declaration_reconfirm_text;
      }
      if (
        body.declaration_privacy_text === null ||
        typeof body.declaration_privacy_text === "string"
      ) {
        updates.declaration_privacy_text = body.declaration_privacy_text;
      }
      if (
        body.declaration_privacy_url === null ||
        typeof body.declaration_privacy_url === "string"
      ) {
        updates.declaration_privacy_url = body.declaration_privacy_url;
      }

      const { error } = await supa
        .from("nursery_settings")
        .upsert(updates, { onConflict: "nursery_id" });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported scope" },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("/api/settings PUT error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
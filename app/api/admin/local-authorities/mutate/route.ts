// app/api/admin/local-authorities/mutate/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- Supabase SSR cookie bridge (official pattern) ---------- */
function getSupabase() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            store.set({ name, value, ...options });
          } catch {
            /* noop on edge runtimes */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            store.set({ name, value: "", ...options, maxAge: 0 });
          } catch {
            /* noop */
          }
        },
      },
    }
  );
}

/* ---------- Admin gate that never throws ---------- */
async function isSuperAdmin(supabase: any): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;
    if (!user) return false;

    // Prefer RPC if present
    try {
      const { data } = await supabase.rpc("auth_has_role_ci_v2", { p_role: "super_admin" });
      if (data === true) return true;
    } catch {
      // fall through to role_grants
    }

    // Fallback: role_grants (ignore errors, just fail closed)
    try {
      const { data: grants } = await supabase
        .from("role_grants")
        .select("role")
        .eq("user_id", user.id);
      return Array.isArray(grants) && grants.some((g: any) => String(g.role || "").toLowerCase() === "super_admin");
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/* ---------- Small utils ---------- */
function pick<T extends object>(obj: T, keys: (keyof T)[]) {
  const out: any = {};
  for (const k of keys) if (obj[k] !== undefined) out[k as string] = obj[k];
  return out;
}

async function resolveEntitlementIdByCode(supabase: any, code?: string | null) {
  const c = (code || "").trim();
  if (!c) return null;
  const { data, error } = await supabase
    .from("funding_entitlements")
    .select("id,code")
    .ilike("code", c)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/* ---------- GET: simple probe ---------- */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const laId = url.searchParams.get("laId");
  return NextResponse.json({ ok: true, dataset: "mutate", laId: laId ?? null });
}

/* ---------- POST: all mutations ---------- */
export async function POST(req: Request) {
  try {
    const supabase = getSupabase();

    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const url = new URL(req.url);
    const laId = String(body?.laId || url.searchParams.get("laId") || "");
    if (!laId) return NextResponse.json({ error: "missing laId" }, { status: 400 });

    const admin = await isSuperAdmin(supabase);
    if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const dataset = String(body?.dataset || "");
    const mode = String(body?.mode || "upsert");
    const row = body?.row || {};

    /* ---------- LOCAL AUTHORITIES (Mark reviewed, URLs, etc.) ---------- */
    if (dataset === "la") {
      if (mode !== "upsert") {
        return NextResponse.json({ error: "unsupported mode for dataset 'la'" }, { status: 400 });
      }
      const patch = pick(row, [
        "name",
        "country",
        "region",
        "public_url",
        "portal_url",
        "is_active",
        "last_reviewed_at",
        "code",
        "gss_code",
        "ons_code",
      ] as const);

      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "no allowed fields to update" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("local_authorities")
        .update(patch)
        .eq("id", laId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    /* ---------- RATES ---------- */
    if (dataset === "rates") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_rates").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const entitlement_id = await resolveEntitlementIdByCode(supabase, row.entitlement_code);
      if (!entitlement_id) return NextResponse.json({ error: "entitlement_code not found" }, { status: 400 });

      const payload = {
        id: row.id ?? undefined,
        la_id: laId,
        entitlement_id,
        effective_from: row.effective_from,
        amount_pence: row.amount_pence ?? null,
        rate_hour: row.rate_hour ?? null,
        notes: row.notes ?? null,
        source_url: row.source_url ?? null,
      };

      const { data, error } = await supabase
        .from("la_rates")
        .upsert(payload, { onConflict: "la_id,entitlement_id,effective_from" })
        .select("id,la_id,effective_from,amount_pence,rate_hour,notes,source_url,funding_entitlements(id,code,name,hours_per_week)")
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    /* ---------- TERM DATES ---------- */
    if (dataset === "terms") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_term_dates").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const base = {
        id: row.id ?? undefined,
        la_id: laId,
        term_name: row.term_name,
        academic_year: row.academic_year ?? null,
        notes: row.notes ?? null,
      };

      let saved: any = null;
      let lastErr: any = null;

      for (const attempt of [
        { obj: { ...base, start_date: row.starts_on ?? row.start_date, end_date: row.ends_on ?? row.end_date }, conflict: "la_id,term_name,start_date" },
        { obj: { ...base, starts_on: row.starts_on ?? row.start_date, ends_on: row.ends_on ?? row.end_date }, conflict: "la_id,term_name,starts_on" },
      ]) {
        const { data, error } = await supabase
          .from("la_term_dates")
          .upsert(attempt.obj, { onConflict: attempt.conflict })
          .select("id,term_name,start_date,end_date,starts_on,ends_on,academic_year,notes")
          .maybeSingle();
        if (!error) { saved = data; break; }
        lastErr = error;
      }

      if (!saved) throw lastErr;
      return NextResponse.json({ ok: true, row: saved });
    }

    /* ---------- CLAIM WINDOWS ---------- */
    if (dataset === "claim_windows") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_claim_windows").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const payload = {
        id: row.id ?? undefined,
        la_id: laId,
        period_code: row.period_code,
        opens_at: row.opens_at,
        closes_at: row.closes_at,
        submit_url: row.submit_url ?? null,
        notes: row.notes ?? null,
      };

      const { data, error } = await supabase
        .from("la_claim_windows")
        .upsert(payload, { onConflict: "la_id,period_code,opens_at" })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    /* ---------- PAYMENT SCHEDULE ---------- */
    if (dataset === "payment_schedule") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_payment_schedule").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const payload = {
        id: row.id ?? undefined,
        la_id: laId,
        period_code: row.period_code,
        payment_date: row.payment_date,
        notes: row.notes ?? null,
      };

      const { data, error } = await supabase
        .from("la_payment_schedule")
        .upsert(payload, { onConflict: "la_id,period_code,payment_date" })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    /* ---------- SUPPLEMENTS ---------- */
    if (dataset === "supplements") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_supplements").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const entitlement_id = await resolveEntitlementIdByCode(supabase, row.entitlement_code);
      if (!entitlement_id) return NextResponse.json({ error: "entitlement_code not found" }, { status: 400 });

      const payload = {
        id: row.id ?? undefined,
        la_id: laId,
        entitlement_id,
        supplement_type: row.supplement_type,
        per: row.per,
        amount_pence: row.amount_pence,
        effective_from: row.effective_from,
        notes: row.notes ?? null,
      };

      const { data, error } = await supabase
        .from("la_supplements")
        .upsert(payload, { onConflict: "la_id,entitlement_id,supplement_type,per,effective_from" })
        .select("*,funding_entitlements(id,code,name,hours_per_week)")
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    /* ---------- DOCUMENTS ---------- */
    if (dataset === "documents") {
      if (mode === "delete") {
        const { error } = await supabase.from("la_documents").delete().eq("id", row.id).eq("la_id", laId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      const payload = {
        id: row.id ?? undefined,
        la_id: laId,
        doc_type: row.doc_type,
        title: row.title,
        url: row.url,
        version: row.version ?? null,
        effective_from: row.effective_from ?? null,
        notes: row.notes ?? null,
      };

      const { data, error } = await supabase
        .from("la_documents")
        .upsert(payload, { onConflict: "la_id,doc_type,title,version" })
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ ok: true, row: data });
    }

    return NextResponse.json({ error: `unknown dataset '${dataset}'` }, { status: 400 });
  } catch (e: any) {
    // Always JSON. Bubble the actual message so the UI can show it.
    return NextResponse.json(
      { error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

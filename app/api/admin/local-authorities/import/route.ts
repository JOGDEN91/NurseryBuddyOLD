// app/api/admin/local-authorities/import/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- CSV parser (quote-aware) ---------------- */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === `"` && next === `"`) {
        field += `"`;
        i++;
      } else if (ch === `"`) {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === `"` && field === "") {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ---------------- Date coercion helpers ---------------- */
function coerceDateToISO(d: string | number | undefined | null): string | null {
  if (d === undefined || d === null) return null;
  let s = String(d).trim();
  if (!s) return null;

  const tIdx = s.indexOf("T");
  const spIdx = s.indexOf(" ");
  if (tIdx > 0) s = s.slice(0, tIdx);
  else if (spIdx > 0) s = s.slice(0, spIdx);

  s = s.replace(/[./]/g, "-").replace(/\s+/g, "");

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d2] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d2.padStart(2, "0")}`;
  }

  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d2, m, y] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d2.padStart(2, "0")}`;
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

function coerceDateTimeToISO(v: string | number | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim();
  if (!raw) return null;

  const dateOnly = coerceDateToISO(raw);
  if (dateOnly) {
    const dt = new Date(`${dateOnly}T09:00:00`);
    return dt.toISOString();
  }

  const dt = new Date(raw);
  if (!isNaN(dt.getTime())) return dt.toISOString();

  return null;
}

/* ---------------- Supabase SSR with cookie bridge ---------------- */
function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({
            name,
            value: "",
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );
}

/* ---------------- Auth / role helpers ---------------- */
async function isSuperAdmin(supabase: any) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, ok: false };

  let ok = false;
  try {
    const { data } = await supabase.rpc("auth_has_role_ci_v2", {
      p_role: "super_admin",
    });
    ok = data === true;
  } catch {
    const { data: grants } = await supabase
      .from("role_grants")
      .select("role")
      .eq("user_id", user.id);
    ok =
      Array.isArray(grants) &&
      grants.some(
        (g: any) => String(g.role || "").toLowerCase() === "super_admin"
      );
  }
  return { user, ok };
}

async function resolveLaIdByNameCountry(
  supabase: any,
  name: string,
  country: string
) {
  const { data, error } = await supabase
    .from("local_authorities")
    .select("id")
    .eq("country", country)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (error) return undefined;
  return (data?.id as string) || undefined;
}

async function resolveEntitlementIdByCode(supabase: any, code: string) {
  const { data, error } = await supabase
    .from("funding_entitlements")
    .select("id,is_active")
    .ilike("code", code)
    .limit(1)
    .maybeSingle();
  if (error || !data || data.is_active === false) return undefined;
  return data.id as string;
}

/* ---------------- Main handler ---------------- */
export async function POST(req: Request) {
  const supabase = getSupabase();
  const summary: Record<string, any> = {};

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: auth } = await supabase.auth.getUser();
    const sawUser = Boolean(auth?.user);

    const { ok } = await isSuperAdmin(supabase);
    if (!ok) {
      return NextResponse.json({ error: "forbidden", sawUser }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) {
      return NextResponse.json({ error: "empty csv" }, { status: 400 });
    }

    const header = rows[0].map((h) => h.trim());
    const head = (s: string) => header.indexOf(s);

    const attach = (ds: string, obj: any, detectedBy?: string) => {
      summary[ds] = detectedBy ? { ...obj, detectedBy } : obj;
    };

    const datasetHint = (
      (form.get("dataset") as string | null) || ""
    ).toLowerCase();

    /* ---- dataset detection ---- */

    const isLocalAuthorities =
      datasetHint === "local_authorities" ||
      (head("name") >= 0 &&
        head("country") >= 0 &&
        (head("gss_code") >= 0 || head("region") >= 0));

    const isRates =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("entitlement_code") >= 0 &&
      head("effective_from") >= 0 &&
      (head("amount_pence") >= 0 || head("rate_hour") >= 0);

    const isTerms =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("term_name") >= 0 &&
      (head("starts_on") >= 0 || head("start_date") >= 0) &&
      (head("ends_on") >= 0 || head("end_date") >= 0);

    const isDocs =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("doc_type") >= 0 &&
      head("title") >= 0 &&
      head("url") >= 0;

    const isClaims =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("period_code") >= 0 &&
      head("opens_at") >= 0 &&
      head("closes_at") >= 0;

    const isPayments =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("period_code") >= 0 &&
      head("payment_date") >= 0;

    const isSupplements =
      head("la_name") >= 0 &&
      head("country") >= 0 &&
      head("entitlement_code") >= 0 &&
      head("supplement_type") >= 0 &&
      head("per") >= 0 &&
      head("amount_pence") >= 0 &&
      head("effective_from") >= 0;

    /* ================= local_authorities ================= */
    if (isLocalAuthorities) {
      const gssIdx = head("gss_code");
      const nameIdx = head("name");
      const countryIdx = head("country");
      const regionIdx = head("region");
      const publicIdx = head("public_url");
      const portalIdx = head("portal_url");
      const activeIdx = head("is_active");
      const reviewedIdx = head("last_reviewed_at");

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const name = nameIdx >= 0 ? row[nameIdx]?.trim() : "";
        const country = countryIdx >= 0 ? row[countryIdx]?.trim() : "";
        if (!name || !country) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        const gss_code =
          gssIdx >= 0 && row[gssIdx] !== undefined && row[gssIdx] !== ""
            ? String(row[gssIdx]).trim()
            : null;
        const region =
          regionIdx >= 0 && row[regionIdx] !== undefined
            ? String(row[regionIdx]).trim() || null
            : null;
        const public_url =
          publicIdx >= 0 && row[publicIdx] !== undefined
            ? String(row[publicIdx]).trim() || null
            : null;
        const portal_url =
          portalIdx >= 0 && row[portalIdx] !== undefined
            ? String(row[portalIdx]).trim() || null
            : null;

        let is_active: boolean | null = null;
        if (activeIdx >= 0 && row[activeIdx] !== undefined) {
          const t = String(row[activeIdx]).trim().toLowerCase();
          if (["y", "yes", "true", "1"].includes(t)) is_active = true;
          else if (["n", "no", "false", "0"].includes(t)) is_active = false;
        }

        const last_reviewed_at =
          reviewedIdx >= 0 && row[reviewedIdx] !== undefined
            ? coerceDateToISO(row[reviewedIdx])
            : null;

        try {
          const payload: any = {
            name,
            country,
            region,
            public_url,
            portal_url,
            is_active,
            last_reviewed_at,
          };
          if (gss_code) payload.gss_code = gss_code;

          if (gss_code) {
            const { error } = await admin
              .from("local_authorities")
              .upsert(payload, {
                onConflict: "gss_code",
                ignoreDuplicates: false,
              });
            if (error) throw error;
          } else {
            const { error } = await admin
              .from("local_authorities")
              .insert(payload);
            if (error) throw error;
          }

          inserted++; // count all as inserted for summary purposes
        } catch (e: any) {
          const msg = String(e?.message || "");
          errors.push({ row: r + 1, message: msg || "upsert/insert failed" });
        }
      }

      attach(
        "local_authorities",
        { inserted, updated, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_rates ================= */
    if (isRates) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country"),
        entIdx = head("entitlement_code");
      const effIdx = head("effective_from"),
        penceIdx = head("amount_pence"),
        rateIdx = head("rate_hour");
      const notesIdx = head("notes"),
        srcIdx = head("source_url");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      type Mode = "amount" | "rate" | "both" | null;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const code = row[entIdx]?.trim();
        const effective = coerceDateToISO(row[effIdx]);

        if (!laName || !country || !code || !effective) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        let mode: Mode = null;
        let amount_pence: number | undefined;
        let rate_hour: number | undefined;

        if (
          penceIdx >= 0 &&
          row[penceIdx] !== undefined &&
          row[penceIdx] !== ""
        ) {
          const n = Number(String(row[penceIdx]).replace(/[, ]/g, ""));
          if (Number.isFinite(n)) amount_pence = Math.round(n);
          mode = "amount";
        }
        if (
          rateIdx >= 0 &&
          row[rateIdx] !== undefined &&
          row[rateIdx] !== ""
        ) {
          const n = Number(String(row[rateIdx]).replace(/[, ]/g, ""));
          if (Number.isFinite(n)) rate_hour = n;
          mode = mode ? "both" : "rate";
        }

        if (
          !mode ||
          (mode === "amount" && typeof amount_pence !== "number") ||
          (mode === "rate" && typeof rate_hour !== "number")
        ) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "invalid amount/rate",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const entId = await resolveEntitlementIdByCode(supabase, code);
          if (!entId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `entitlement not found or inactive: ${code}`,
            });
            continue;
          }

          const base: any = {
            la_id: laId,
            entitlement_id: entId,
            effective_from: effective,
            notes: notesIdx >= 0 ? row[notesIdx] || null : null,
            source_url: srcIdx >= 0 ? row[srcIdx] || null : null,
          };

          const attempts: any[] = [];
          if (mode === "amount") attempts.push({ ...base, amount_pence });
          if (mode === "rate") attempts.push({ ...base, rate_hour });
          if (mode === "both")
            attempts.push({ ...base, amount_pence, rate_hour });

          let did = false;
          let lastErr: any = null;

          for (const obj of attempts) {
            const { error } = await supabase
              .from("la_rates")
              .upsert(obj, {
                onConflict: "la_id,entitlement_id,effective_from",
                ignoreDuplicates: false,
              });
            if (!error) {
              did = true;
              break;
            }
            lastErr = error;
          }

          if (!did) throw lastErr || new Error("upsert failed");
          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_rates policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach("la_rates", { upserted, skipped, errors, skipped_details }, "header");
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_term_dates ================= */
    if (isTerms) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country"),
        nameIdx = head("term_name");
      const startIdx =
        head("starts_on") >= 0 ? head("starts_on") : head("start_date");
      const endIdx =
        head("ends_on") >= 0 ? head("ends_on") : head("end_date");
      const yearIdx = head("academic_year");
      const notesIdx = head("notes");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const termName = row[nameIdx]?.trim();
        const s = coerceDateToISO(row[startIdx]);
        const e = coerceDateToISO(row[endIdx]);

        if (!laName || !country || !termName || !s || !e) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const base = {
            la_id: laId,
            term_name: termName,
            academic_year: yearIdx >= 0 ? row[yearIdx] || null : null,
            notes: notesIdx >= 0 ? row[notesIdx] || null : null,
          };

          let did = false;
          let lastErr: any = null;

          for (const attempt of [
            {
              obj: { ...base, start_date: s, end_date: e },
              conflict: "la_id,term_name,start_date",
            },
            {
              obj: { ...base, starts_on: s, ends_on: e },
              conflict: "la_id,term_name,starts_on",
            },
          ]) {
            const { error } = await supabase
              .from("la_term_dates")
              .upsert(attempt.obj, {
                onConflict: attempt.conflict,
                ignoreDuplicates: false,
              });
            if (!error) {
              did = true;
              break;
            }
            lastErr = error;
          }

          if (!did) throw lastErr || new Error("upsert failed");
          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_term_dates policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach(
        "la_term_dates",
        { upserted, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_documents ================= */
    if (isDocs) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country");
      const typeIdx = head("doc_type"),
        titleIdx = head("title"),
        urlIdx = head("url");
      const verIdx = head("version"),
        effIdx = head("effective_from"),
        notesIdx = head("notes");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const docType = row[typeIdx]?.trim();
        const title = row[titleIdx]?.trim();
        const url = row[urlIdx]?.trim();
        const version = verIdx >= 0 ? row[verIdx] || null : null;
        const eff = effIdx >= 0 ? coerceDateToISO(row[effIdx]) : null;
        const notes = notesIdx >= 0 ? row[notesIdx] || null : null;

        if (!laName || !country || !docType || !title || !url) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const { error } = await supabase
            .from("la_documents")
            .upsert(
              {
                la_id: laId,
                doc_type: docType,
                title,
                url,
                version,
                effective_from: eff,
                notes,
              },
              {
                onConflict: "la_id,doc_type,title,version",
                ignoreDuplicates: false,
              }
            );

          if (error) throw error;
          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_documents policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach(
        "la_documents",
        { upserted, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_claim_windows ================= */
    if (isClaims) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country");
      const periodIdx = head("period_code"),
        openIdx = head("opens_at"),
        closeIdx = head("closes_at");
      const urlIdx = head("submit_url"),
        notesIdx = head("notes");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const period_code = row[periodIdx]?.trim();
        const opens_at = coerceDateTimeToISO(row[openIdx]);
        const closes_at = coerceDateTimeToISO(row[closeIdx]);
        const submit_url = urlIdx >= 0 ? row[urlIdx] || null : null;
        const notes = notesIdx >= 0 ? row[notesIdx] || null : null;

        if (!laName || !country || !period_code || !opens_at || !closes_at) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const { error } = await supabase
            .from("la_claim_windows")
            .upsert(
              {
                la_id: laId,
                period_code,
                opens_at,
                closes_at,
                submit_url,
                notes,
              },
              {
                onConflict: "la_id,period_code,opens_at",
                ignoreDuplicates: false,
              }
            );
          if (error) throw error;

          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_claim_windows policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach(
        "la_claim_windows",
        { upserted, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_payment_schedule ================= */
    if (isPayments) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country");
      const periodIdx = head("period_code"),
        dateIdx = head("payment_date");
      const notesIdx = head("notes");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const period_code = row[periodIdx]?.trim();
        const payment_date = coerceDateToISO(row[dateIdx]);
        const notes = notesIdx >= 0 ? row[notesIdx] || null : null;

        if (!laName || !country || !period_code || !payment_date) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing required field(s)",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const { error } = await supabase
            .from("la_payment_schedule")
            .upsert(
              { la_id: laId, period_code, payment_date, notes },
              {
                onConflict: "la_id,period_code,payment_date",
                ignoreDuplicates: false,
              }
            );
          if (error) throw error;

          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_payment_schedule policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach(
        "la_payment_schedule",
        { upserted, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    /* ================= la_supplements ================= */
    if (isSupplements) {
      const laNameIdx = head("la_name"),
        countryIdx = head("country");
      const entIdx = head("entitlement_code"),
        typeIdx = head("supplement_type"),
        perIdx = head("per");
      const penceIdx = head("amount_pence"),
        effIdx = head("effective_from"),
        notesIdx = head("notes");

      let upserted = 0,
        skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];
      const skipped_details: Array<{ row: number; reason: string }> = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const laName = row[laNameIdx]?.trim();
        const country = row[countryIdx]?.trim();
        const entCode = row[entIdx]?.trim();
        const supplement_type = row[typeIdx]?.trim();
        const per = row[perIdx]?.trim();
        const amount_raw = Number(String(row[penceIdx]).replace(/[, ]/g, ""));
        const effective_from = coerceDateToISO(row[effIdx]);
        const notes = notesIdx >= 0 ? row[notesIdx] || null : null;

        if (
          !laName ||
          !country ||
          !entCode ||
          !supplement_type ||
          !per ||
          !effective_from ||
          !Number.isFinite(amount_raw)
        ) {
          skipped++;
          skipped_details.push({
            row: r + 1,
            reason: "missing/invalid required field(s)",
          });
          continue;
        }

        try {
          const laId = await resolveLaIdByNameCountry(supabase, laName, country);
          if (!laId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `LA not found: ${laName} / ${country}`,
            });
            continue;
          }

          const entId = await resolveEntitlementIdByCode(supabase, entCode);
          if (!entId) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: `entitlement not found or inactive: ${entCode}`,
            });
            continue;
          }

          const { error } = await supabase
            .from("la_supplements")
            .upsert(
              {
                la_id: laId,
                entitlement_id: entId,
                supplement_type,
                per,
                amount_pence: Math.round(amount_raw),
                effective_from,
                notes,
              },
              {
                onConflict:
                  "la_id,entitlement_id,supplement_type,per,effective_from",
                ignoreDuplicates: false,
              }
            );
          if (error) throw error;

          upserted++;
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (/duplicate key value violates unique constraint/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "duplicate (existing)",
            });
          } else if (/row-level security/i.test(msg)) {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: "RLS blocked insert (check la_supplements policies)",
            });
          } else {
            skipped++;
            skipped_details.push({
              row: r + 1,
              reason: msg || "upsert failed",
            });
          }
        }
      }

      attach(
        "la_supplements",
        { upserted, skipped, errors, skipped_details },
        "header"
      );
      return NextResponse.json({ ok: true, sawUser, summary });
    }

    // Unknown dataset – echo headers so you can debug
    return NextResponse.json({
      ok: true,
      sawUser,
      summary: { unknown: { detectedBy: "header", headers: header } },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "unexpected error",
        stack:
          process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

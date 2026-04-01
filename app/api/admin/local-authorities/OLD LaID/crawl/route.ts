// app/api/admin/local-authorities/[laId]/crawl/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- Supabase SSR + role ---------------- */
function getSupabase() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => jar }
  );
}
async function ensureSuperAdmin(supabase: any) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return false;
  try {
    const { data } = await supabase.rpc("auth_has_role_ci_v2", { p_role: "super_admin" });
    return data === true;
  } catch {
    const { data: grants } = await supabase.from("role_grants").select("role").eq("user_id", user.id);
    return Array.isArray(grants) && grants.some((g: any) => String(g.role || "").toLowerCase() === "super_admin");
  }
}

/* ---------------- Date helpers ---------------- */
function coerceDateToISO(d: string | number | undefined | null): string | null {
  if (d === undefined || d === null) return null;
  let s = String(d).trim();
  if (!s) return null;

  // canonicalise separators
  s = s.replace(/[./]/g, "-").replace(/\s+/g, " ").trim();

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd-mm-yyyy
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d2, m, y] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d2.padStart(2, "0")}`;
  }

  // d Month yyyy (e.g., 2 September 2025)
  const monthMap: Record<string, string> = {
    january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12"
  };
  const m1 = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m1) {
    const d2 = m1[1].padStart(2, "0");
    const mmm = (m1[2] || "").toLowerCase();
    const y = m1[3];
    const mm = monthMap[mmm];
    if (mm) return `${y}-${mm}-${d2}`;
  }

  // fallback to Date()
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

/* ---------------- HTML parsing (no external deps) ---------------- */
function stripHtmlPreserveBreaks(html: string): string {
  // remove script/style
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
             .replace(/<style[\s\S]*?<\/style>/gi, " ");
  // replace <br>, </p>, </tr> with line breaks
  html = html.replace(/<(br|\/p|\/tr)\b[^>]*>/gi, "\n");
  // compress table cells into spaces
  html = html.replace(/<\/t[dh]>/gi, " ");
  // strip remaining tags
  html = html.replace(/<[^>]+>/g, " ");
  // decode minimal entities
  html = html.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  // normalise whitespace
  return html.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

type ExtractedTerm = { term_name: string; start: string; end: string; source_line?: string };

/**
 * Extract term ranges from a typical UK LA landing page.
 * Heuristics:
 *  - Look for lines containing two dates (any of: dd/mm/yyyy, dd-mm-yyyy, d Month yyyy)
 *  - Capture nearby "Term" labels (Autumn, Spring, Summer, Term 1..6, Half term blocks)
 */
function extractTermDatesFromText(text: string): ExtractedTerm[] {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // date tokens
  const dmy = `(?:\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4}|\\d{1,2}\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2})`;
  const dateRe = new RegExp(dmy, "i");
  const twoDatesRe = new RegExp(`${dmy}[^\\dA-Za-z]+${dmy}`, "i");

  const labelRe = /(autumn|spring|summer|term\s*[1-6]|half[-\s]?term|easter|christmas|bank holiday)/i;

  const out: ExtractedTerm[] = [];

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!twoDatesRe.test(L)) continue;

    // obtain the two dates
    const dates = L.match(new RegExp(dmy, "ig")) || [];
    if (dates.length < 2) continue;

    // try to get a label from this or nearby lines
    let label = (L.match(labelRe)?.[0] || "").replace(/\s+/g, " ").trim();
    if (!label && i > 0) label = (lines[i-1].match(labelRe)?.[0] || "").trim();
    if (!label && i+1 < lines.length) label = (lines[i+1].match(labelRe)?.[0] || "").trim();
    if (!label) label = "Term"; // fallback

    // normalise common forms
    label = label.replace(/term\s*([1-6])/i, "Term $1");
    label = label.replace(/half[-\s]?term/i, "Half term");
    label = label.charAt(0).toUpperCase() + label.slice(1);

    const startISO = coerceDateToISO(dates[0]);
    const endISO = coerceDateToISO(dates[1]);
    if (!startISO || !endISO) continue;

    out.push({ term_name: label, start: startISO, end: endISO, source_line: L });
  }

  // de-dup by (term_name,start)
  const seen = new Set<string>();
  const dedup: ExtractedTerm[] = [];
  for (const t of out) {
    const key = `${t.term_name}__${t.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(t);
  }
  return dedup;
}

/* ---------------- Main handler ---------------- */
export async function POST(req: Request, { params }: { params: { laId: string } }) {
  const supabase = getSupabase();
  if (!(await ensureSuperAdmin(supabase))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const laId = params.laId;
  const body = await req.json().catch(() => ({}));
  const section = String(body?.section || "term_dates"); // only term_dates supported for now
  const urlFromBody = (body?.url ? String(body.url) : "").trim();
  const apply = Boolean(body?.apply); // if true, upsert; else preview

  if (section !== "term_dates") {
    return NextResponse.json({ error: "unsupported section", section }, { status: 400 });
  }

  try {
    // Resolve source URL: prefer body.url, else la_documents.doc_type='term_dates'
    let sourceUrl = urlFromBody;
    if (!sourceUrl) {
      const { data, error } = await supabase
        .from("la_documents")
        .select("url")
        .eq("la_id", laId)
        .eq("doc_type", "term_dates")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      sourceUrl = data?.url || "";
    }
    if (!sourceUrl) {
      return NextResponse.json({ error: "no source URL (provide body.url or add la_documents row with doc_type=term_dates)" }, { status: 400 });
    }

    // Fetch page
    const res = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "user-agent": "NurseryBuddyCrawler/1.0 (+https://example.invalid)",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `fetch ${res.status}`, url: sourceUrl }, { status: 502 });
    }
    const html = await res.text();
    const text = stripHtmlPreserveBreaks(html);

    // Extract terms
    const items = extractTermDatesFromText(text);

    // Confidence heuristic
    const confidence =
      (items.length >= 3 ? 0.7 : items.length === 2 ? 0.5 : items.length === 1 ? 0.3 : 0.0);

    if (!apply) {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        url: sourceUrl,
        confidence,
        found: items,
      });
    }

    // Apply: upsert each row
    let upserted = 0;
    const skipped_details: Array<{ term_name: string; reason: string }> = [];

    for (const it of items) {
      const payload = {
        la_id: laId,
        term_name: it.term_name,
        start_date: it.start,   // tolerate current schema
        end_date: it.end,
        // starts_on/ends_on will also be tried if unique constraint differs
      };

      // try start_date/end_date, then starts_on/ends_on
      let ok = false;
      let lastErr: any = null;

      for (const attempt of [
        { obj: payload, conflict: "la_id,term_name,start_date" },
        { obj: { ...payload, starts_on: it.start, ends_on: it.end }, conflict: "la_id,term_name,starts_on" },
      ]) {
        const { error } = await supabase
          .from("la_term_dates")
          .upsert(attempt.obj, { onConflict: attempt.conflict, ignoreDuplicates: false });
        if (!error) { ok = true; break; }
        lastErr = error;
      }

      if (ok) upserted++;
      else skipped_details.push({ term_name: it.term_name, reason: String(lastErr?.message || "upsert failed") });
    }

    return NextResponse.json({
      ok: true,
      mode: "apply",
      url: sourceUrl,
      confidence,
      upserted,
      skipped: skipped_details.length,
      skipped_details,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unexpected error" }, { status: 500 });
  }
}

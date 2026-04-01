// app/api/admin/local-authorities/sources/check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

function authClient() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) => jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

async function ensureSuperAdmin(sb: ReturnType<typeof createServerClient>) {
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return false;
  const role = (user.app_metadata as any)?.role;
  if (typeof role === "string" && role.toLowerCase() === "super_admin") return true;
  try {
    const { data: isSa } = await sb.rpc("is_super_admin");
    if (isSa === true) return true;
  } catch {}
  return false;
}

const sha256 = (buf: ArrayBuffer | Buffer) =>
  crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");

export async function POST(req: NextRequest) {
  try {
    const sbAuth = authClient();
    const ok = await ensureSuperAdmin(sbAuth);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sb = adminClient();

    // optional filters: ?la_id=...&kind=rates
    const url = new URL(req.url);
    const la_id = url.searchParams.get("la_id");
    const kind = url.searchParams.get("kind"); // rates|terms|rules

    let q = sb.from("la_sources")
      .select("id, la_id, kind, source_url, parser, selector, etag, content_hash, last_checked_at, local_authorities(name)")
      .eq("active", true);
    if (la_id) q = q.eq("la_id", la_id);
    if (kind) q = q.eq("kind", kind);

    const { data: sources, error } = await q;
    if (error) throw new Error(error.message);

    const results: any[] = [];
    for (const s of sources || []) {
      try {
        // Conditional GET with ETag if we have one
        const res = await fetch(s.source_url, {
          headers: s.etag ? { "If-None-Match": s.etag } : {},
          cache: "no-store",
        });

        if (res.status === 304) {
          // unchanged
          await sb.from("la_sources").update({ last_checked_at: new Date().toISOString() }).eq("id", s.id);
          results.push({ id: s.id, status: 304, unchanged: true });
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const etag = res.headers.get("etag") || null;
        const mime = res.headers.get("content-type") || "application/octet-stream";
        const buf = await res.arrayBuffer();
        const hash = sha256(buf);

        if (hash === s.content_hash) {
          // content hash unchanged (even if ETag missing)
          await sb.from("la_sources").update({ etag, last_checked_at: new Date().toISOString() }).eq("id", s.id);
          results.push({ id: s.id, status: 200, unchanged: true });
          continue;
        }

        // Basic text extraction (works for HTML/text; PDFs may return binary)
        // We'll keep it simple: try text(), fallback to empty.
        let text = "";
        try { text = await (new Response(buf)).text(); } catch {}

        // Snapshot for audit
        await sb.from("la_source_snapshots").insert({
          la_source_id: s.id,
          content_hash: hash,
          mime_type: mime,
          bytes: Buffer.from(buf),
          text_content: text?.slice(0, 500_000) ?? null, // cap size
        });

        // Update registry with new etag/hash/checked_at
        await sb.from("la_sources").update({
          etag, content_hash: hash, last_checked_at: new Date().toISOString()
        }).eq("id", s.id);

        // TODO: parsing to staging (keep a simple placeholder for now)
        // Example: for terms (html_table + selector), we'd parse a table and fill la_term_dates_staging.
        // For now, just report "changed".
        results.push({ id: s.id, status: 200, changed: true });
      } catch (e: any) {
        results.push({ id: s.id, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ checked: sources?.length ?? 0, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled error" }, { status: 500 });
  }
}

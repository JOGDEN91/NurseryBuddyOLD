// app/api/admin/local-authorities/links/check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
    const { data: ok } = await sb.rpc("is_super_admin");
    if (ok === true) return true;
  } catch {}
  return false;
}

async function checkUrl(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    // some servers block HEAD; fall back to GET (no body read)
    if (!res.ok || res.status >= 400) {
      const res2 = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
      return { ok: res2.ok, status: res2.status, finalUrl: res2.url };
    }
    return { ok: true, status: res.status, finalUrl: res.url };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message || "network_error" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const sbAuth = authClient();
    if (!(await ensureSuperAdmin(sbAuth))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sb = adminClient();

    // Optional filters ?la_id=...  (so you can check one LA from a detail page)
    const u = new URL(req.url);
    const la_id = u.searchParams.get("la_id");

    // Load LAs
    let laQ = sb.from("local_authorities")
      .select("id,name,public_url,portal_url")
      .order("name", { ascending: true });
    if (la_id) laQ = laQ.eq("id", la_id);
    const { data: las, error: laErr } = await laQ;
    if (laErr) throw new Error(laErr.message);

    // Load sources
    let srcQ = sb.from("la_sources")
      .select("id,la_id,kind,source_url,parser,active")
      .eq("active", true);
    if (la_id) srcQ = srcQ.eq("la_id", la_id);
    const { data: sources, error: srcErr } = await srcQ;
    if (srcErr) throw new Error(srcErr.message);

    const results: any[] = [];

    // Check LA public/portal
    for (const la of las || []) {
      for (const key of ["public_url", "portal_url"] as const) {
        const url = (la as any)[key] as string | null;
        if (!url) continue;
        const r = await checkUrl(url);
        results.push({
          type: "la",
          la_id: la.id,
          name: la.name,
          field: key,
          url,
          ...r,
        });
      }
    }

    // Check sources
    for (const s of sources || []) {
      if (!s.source_url) continue;
      const r = await checkUrl(s.source_url);
      results.push({
        type: "source",
        id: s.id,
        la_id: s.la_id,
        kind: s.kind,
        url: s.source_url,
        parser: s.parser,
        ...r,
      });
    }

    // Summaries
    const broken = results.filter((r) => !r.ok);
    return NextResponse.json({
      checked: results.length,
      broken: broken.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled error" }, { status: 500 });
  }
}

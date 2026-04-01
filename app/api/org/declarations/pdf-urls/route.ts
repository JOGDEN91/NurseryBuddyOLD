// app/api/org/declarations/pdf-urls/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return { get: (n: string) => jar.get(n)?.value, set() {}, remove() {} };
}

export async function POST(req: Request) {
  const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(body?.declaration_ids) ? body.declaration_ids.map((x: any) => String(x)) : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "Missing declaration_ids" }, { status: 400 });

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: grants } = await admin.from("role_grants").select("org_id, role").eq("user_id", user.id);
  const orgId = (grants ?? []).find((g: any) => String(g.role ?? "").toUpperCase() === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data: decls } = await admin
    .from("child_declarations")
    .select("id, nursery_id, snapshot")
    .in("id", ids);

  const urls: Array<{ id: string; url: string }> = [];

  for (const d of (decls ?? []) as any[]) {
    // org check
    const { data: nursery } = await admin.from("nurseries").select("organisation_id").eq("id", d.nursery_id).maybeSingle();
    if (!nursery || String(nursery.organisation_id) !== String(orgId)) continue;

    const path = d?.snapshot?.pdf?.storage_path ?? null;
    if (!path) continue;

    const { data } = await admin.storage.from("declarations").createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) urls.push({ id: d.id, url: data.signedUrl });
  }

  return NextResponse.json({ ok: true, urls });
}
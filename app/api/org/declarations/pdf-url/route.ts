// app/api/org/declarations/pdf-url/route.ts
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

export async function GET(req: Request) {
  const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const u = new URL(req.url);
  const declarationId = String(u.searchParams.get("declaration_id") ?? "").trim();
  if (!declarationId) return NextResponse.json({ ok: false, error: "Missing declaration_id" }, { status: 400 });

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  // ORG_ADMIN scope
  const { data: grants } = await admin.from("role_grants").select("org_id, role").eq("user_id", user.id);
  const orgId = (grants ?? []).find((g: any) => String(g.role ?? "").toUpperCase() === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Declaration must belong to this org (via nursery)
  const { data: decl } = await admin
    .from("child_declarations")
    .select("id, nursery_id, snapshot")
    .eq("id", declarationId)
    .maybeSingle();

  if (!decl) return NextResponse.json({ ok: false, error: "Declaration not found" }, { status: 404 });

  const { data: nursery } = await admin.from("nurseries").select("organisation_id").eq("id", (decl as any).nursery_id).maybeSingle();
  if (!nursery || String((nursery as any).organisation_id) !== String(orgId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const path = (decl as any)?.snapshot?.pdf?.storage_path ?? null;
  if (!path) return NextResponse.json({ ok: false, error: "PDF not available yet" }, { status: 404 });

  const { data, error } = await admin.storage.from("declarations").createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) return NextResponse.json({ ok: false, error: error?.message ?? "Unable to create signed URL" }, { status: 400 });

  return NextResponse.json({ ok: true, url: data.signedUrl });
}
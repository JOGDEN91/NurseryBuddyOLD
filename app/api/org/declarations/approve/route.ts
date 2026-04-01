// app/api/org/declarations/approve/route.ts
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
  const declarationId = String(body?.declaration_id ?? "").trim();
  if (!declarationId) return NextResponse.json({ ok: false, error: "Missing declaration_id" }, { status: 400 });

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  // ORG_ADMIN check
  const { data: grants } = await admin.from("role_grants").select("org_id, role").eq("user_id", user.id);
  const orgId = (grants ?? []).find((g: any) => String(g.role ?? "").toUpperCase() === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Ensure declaration belongs to org via nursery
  const { data: decl } = await admin
    .from("child_declarations")
    .select("id, nursery_id, status")
    .eq("id", declarationId)
    .maybeSingle();

  if (!decl) return NextResponse.json({ ok: false, error: "Declaration not found" }, { status: 404 });

  const { data: nursery } = await admin
    .from("nurseries")
    .select("organisation_id")
    .eq("id", (decl as any).nursery_id)
    .maybeSingle();

  if (!nursery || String((nursery as any).organisation_id) !== String(orgId)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error: upErr } = await admin
    .from("child_declarations")
    .update({ status: "approved" })
    .eq("id", declarationId);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  // best-effort audit
  try {
    await admin.from("audit_events").insert({
      org_id: orgId,
      nursery_id: (decl as any).nursery_id,
      actor_user_id: user.id,
      action: "declarations.approve",
      entity_type: "child_declarations",
      entity_id: declarationId,
      details: { previous_status: (decl as any).status ?? null, new_status: "approved" },
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
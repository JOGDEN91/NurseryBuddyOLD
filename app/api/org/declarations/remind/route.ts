// app/api/org/declarations/remind/route.ts
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

function isDocsComplete(docs: any[]): boolean {
  const get = (key: string) => (docs ?? []).find((d: any) => String(d?.label ?? "").toLowerCase().includes(key))?.status;
  const bc = get("birth");
  const pa = get("address");
  const fc = get("funding code");
  const id = get("id");
  return [bc, pa, fc, id].every((s) => String(s ?? "").toLowerCase() === "verified");
}

function isMissingSignature(status: string) {
  const s = String(status ?? "").toLowerCase().trim();
  if (s === "signed" || s === "approved" || s === "superseded") return false;
  return true;
}

export async function POST(req: Request) {
  const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const nurseryId = String(body?.nursery_id ?? "").trim();
  const termId = String(body?.term_id ?? "").trim();
  const includeMissingSignatures = !!body?.include_missing_signatures;
  const includeMissingDocuments = !!body?.include_missing_documents;

  if (!nurseryId || !termId) return NextResponse.json({ ok: false, error: "Missing nursery_id or term_id" }, { status: 400 });
  if (!includeMissingSignatures && !includeMissingDocuments) return NextResponse.json({ ok: false, error: "No reminder type selected" }, { status: 400 });

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: grants } = await admin.from("role_grants").select("org_id, role").eq("user_id", user.id);
  const orgId = (grants ?? []).find((g: any) => String(g.role ?? "").toUpperCase() === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Use your existing declarations API to compute who needs a reminder
  const params = new URLSearchParams();
  params.set("nursery_id", nurseryId);
  params.set("term_id", termId);

  const res = await fetch(`${URL.replace(/\/$/, "")}/rest/v1/rpc/noop`, { method: "GET" }).catch(() => null);
  // (No-op: keep toolchains happy; we use Next server fetch below)

  const localRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/org/declarations?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: {
      cookie: cookies().toString(),
    } as any,
  }).catch(() => null);

  // If the above cannot call back into itself due to environment, fall back to direct DB.
  let items: any[] = [];

  if (localRes && localRes.ok) {
    const j = await localRes.json().catch(() => ({} as any));
    items = Array.isArray(j?.items) ? j.items : [];
  } else {
    // direct DB fallback: we can at least target missing signatures via status
    const { data: decls } = await admin
      .from("child_declarations")
      .select("id, child_id, status")
      .eq("nursery_id", nurseryId)
      .eq("term_id", termId);

    items = (decls ?? []).map((d: any) => ({
      id: d.id,
      status: d.status,
      child: { id: d.child_id, first_name: null, last_name: null },
      docs: [],
    }));
  }

  const targets: any[] = [];
  for (const d of items) {
    const needSig = includeMissingSignatures ? isMissingSignature(String(d.status ?? "")) : false;
    const needDocs = includeMissingDocuments ? !isDocsComplete(d.docs ?? []) : false;
    if (needSig || needDocs) targets.push(d);
  }

  // Best-effort audit event (this is what your scheduler can consume later)
  try {
    await admin.from("audit_events").insert({
      org_id: orgId,
      nursery_id: nurseryId,
      actor_user_id: user.id,
      action: "declarations.remind",
      entity_type: "child_declarations",
      entity_id: null,
      details: {
        term_id: termId,
        include_missing_signatures: includeMissingSignatures,
        include_missing_documents: includeMissingDocuments,
        targets_count: targets.length,
        declaration_ids: targets.slice(0, 200).map((x: any) => x.id),
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, targets: { count: targets.length } });
}
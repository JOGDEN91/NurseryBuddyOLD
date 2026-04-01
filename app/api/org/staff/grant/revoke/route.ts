import { NextResponse } from "next/server";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminClient } from "@/lib/supabaseAdmin";

function wantsJson(req: Request) {
  const ct = req.headers.get("content-type") || "";
  const accept = req.headers.get("accept") || "";
  return ct.includes("application/json") || accept.includes("application/json");
}

function redirectWithMsg(req: Request, msg: string) {
  const url = new URL("/org/staff", req.url);
  url.searchParams.set("msg", msg);
  return NextResponse.redirect(url, { status: 303 });
}

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

async function resolveActorSnapshot(admin: any, actorUserId: string) {
  const { data } = await admin.auth.admin.getUserById(actorUserId);
  const u = data?.user;
  const meta = u?.user_metadata ?? u?.raw_user_meta_data ?? {};
  const first_name = clean(meta?.first_name);
  const surname = clean(meta?.surname);
  const display_name = `${first_name} ${surname}`.trim() || u?.email || actorUserId;

  return {
    actor_user_id: actorUserId,
    actor_email: u?.email ?? null,
    actor_first_name: first_name || null,
    actor_surname: surname || null,
    actor_display_name: display_name || null,
  };
}

async function audit(admin: any, row: any) {
  try {
    await admin.from("audit_events").insert(row);
  } catch {
    // Best-effort
  }
}

export async function POST(req: Request) {
  const { user, grants } = await getWhoAmI();
  if (!user || !hasRole(grants, "ORG_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = (grants || []).find((g: any) => g.role === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) {
    const msg = "error:No organisation context found";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const contentType = req.headers.get("content-type") || "";
  const body =
    contentType.includes("application/json")
      ? await req.json()
      : Object.fromEntries(await req.formData());

  const grant_id = clean((body as any).grant_id);
  if (!grant_id) {
    const msg = "error:Missing grant_id";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const supabase = getServerSupabase();

  // Fetch the grant first so we can audit what was revoked.
  const { data: existing, error: exErr } = await supabase
    .from("role_grants")
    .select("id, user_id, role, nursery_id, org_id, created_at")
    .eq("id", grant_id)
    .eq("org_id", orgId)
    .single();

  if (exErr || !existing) {
    const msg = "error:Grant not found";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 404 }) : redirectWithMsg(req, msg);
  }

  const { error: delErr } = await supabase
    .from("role_grants")
    .delete()
    .eq("id", grant_id)
    .eq("org_id", orgId);

  if (delErr) {
    const msg = `error:${delErr.message}`;
    return wantsJson(req) ? NextResponse.json({ error: delErr.message }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  // Audit snapshot
  const admin = getAdminClient();
  const actorSnap = await resolveActorSnapshot(admin, user.id);

  await audit(admin, {
    org_id: orgId,
    nursery_id: existing.nursery_id,
    ...actorSnap,
    action: "staff.grant.revoke",
    entity_type: "role_grants",
    entity_id: grant_id,
    details: {
      target_user_id: existing.user_id,
      revoked_role: existing.role,
      revoked_nursery_id: existing.nursery_id,
      grant_created_at: existing.created_at,
    },
  });

  return wantsJson(req) ? NextResponse.json({ ok: true }) : redirectWithMsg(req, "grant_revoked");
}
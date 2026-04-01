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
    // best-effort
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
  const roleRaw = clean((body as any).role);
  const role = roleRaw.toUpperCase();

  const nursery_id_raw = clean((body as any).nursery_id);
  let nursery_id = nursery_id_raw ? nursery_id_raw : null;

  if (!grant_id || !role) {
    const msg = "error:Missing grant_id or role";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  // Enforce ORG_ADMIN scope rule
  if (role === "ORG_ADMIN") nursery_id = null;

  const supabase = getServerSupabase();

  const { data: existing, error: exErr } = await supabase
    .from("role_grants")
    .select("id, user_id, role, nursery_id, org_id")
    .eq("id", grant_id)
    .eq("org_id", orgId)
    .single();

  if (exErr || !existing) {
    const msg = "error:Grant not found";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 404 }) : redirectWithMsg(req, msg);
  }

  const { error: upErr } = await supabase
    .from("role_grants")
    .update({ role, nursery_id })
    .eq("id", grant_id)
    .eq("org_id", orgId);

  if (upErr) {
    const msg = `error:${upErr.message}`;
    return wantsJson(req) ? NextResponse.json({ error: upErr.message }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const admin = getAdminClient();
  const actorSnap = await resolveActorSnapshot(admin, user.id);

  await audit(admin, {
    org_id: orgId,
    nursery_id,
    ...actorSnap,
    action: "staff.grant.update",
    entity_type: "role_grants",
    entity_id: grant_id,
    details: {
      target_user_id: existing.user_id,
      previous_role: existing.role,
      previous_nursery_id: existing.nursery_id,
      new_role: role,
      new_nursery_id: nursery_id,
    },
  });

  return wantsJson(req) ? NextResponse.json({ ok: true }) : redirectWithMsg(req, "grant_updated");
}
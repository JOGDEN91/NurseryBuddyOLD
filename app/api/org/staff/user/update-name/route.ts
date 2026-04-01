import { NextResponse } from "next/server";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { getServerSupabase } from "@/lib/supabaseServer";

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

  const target_user_id = clean((body as any).user_id);
  const first_name = clean((body as any).first_name);
  const surname = clean((body as any).surname);

  if (!target_user_id) {
    const msg = "error:Missing user_id";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  // Ensure target user is in this org.
  const supabase = getServerSupabase();
  const { data: anyGrant, error: grantErr } = await supabase
    .from("role_grants")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", target_user_id)
    .limit(1);

  if (grantErr || !anyGrant || anyGrant.length === 0) {
    const msg = "error:User is not a member of this organisation";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 404 }) : redirectWithMsg(req, msg);
  }

  const admin = getAdminClient();

  const { data: uData, error: uErr } = await admin.auth.admin.getUserById(target_user_id);
  if (uErr || !uData?.user) {
    const msg = `error:${uErr?.message ?? "Could not load user"}`;
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const existingMeta = (uData.user.user_metadata ?? uData.user.raw_user_meta_data ?? {}) as Record<string, any>;
  const nextMeta: Record<string, any> = { ...existingMeta };

  if (first_name) nextMeta.first_name = first_name;
  else delete nextMeta.first_name;

  if (surname) nextMeta.surname = surname;
  else delete nextMeta.surname;

  const { error: upErr } = await admin.auth.admin.updateUserById(target_user_id, { user_metadata: nextMeta });
  if (upErr) {
    const msg = `error:${upErr.message}`;
    return wantsJson(req) ? NextResponse.json({ error: upErr.message }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  // Audit snapshot
  const actorSnap = await resolveActorSnapshot(admin, user.id);
  await audit(admin, {
    org_id: orgId,
    nursery_id: null,
    ...actorSnap,
    action: "staff.user.update_name",
    entity_type: "auth.users",
    entity_id: target_user_id,
    details: {
      new_first_name: first_name || null,
      new_surname: surname || null,
    },
  });

  return wantsJson(req) ? NextResponse.json({ ok: true }) : redirectWithMsg(req, "name_updated");
}
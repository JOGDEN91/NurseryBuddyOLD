import { NextResponse } from "next/server";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminClient } from "@/lib/supabaseAdmin";

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
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const orgId = (grants || []).find((g: any) => g.role === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "No organisation context found" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));

  const target_user_id = clean(body?.user_id);
  const role = clean(body?.role).toUpperCase();
  const nursery_ids_in = body?.nursery_ids;

  if (!target_user_id || !role) {
    return NextResponse.json({ ok: false, error: "Missing user_id or role" }, { status: 400 });
  }

  let nursery_ids: string[] = [];
  if (Array.isArray(nursery_ids_in)) {
    nursery_ids = nursery_ids_in.map((x: any) => clean(x)).filter(Boolean);
  }

  // Scope rules
  const rows: Array<{ user_id: string; role: string; org_id: string; nursery_id: string | null }> = [];
  if (role === "ORG_ADMIN") {
    rows.push({ user_id: target_user_id, role, org_id: orgId, nursery_id: null });
  } else if (!nursery_ids || nursery_ids.length === 0) {
    rows.push({ user_id: target_user_id, role, org_id: orgId, nursery_id: null });
  } else {
    const uniq = Array.from(new Set(nursery_ids));
    for (const id of uniq) rows.push({ user_id: target_user_id, role, org_id: orgId, nursery_id: id });
  }

  const supabase = getServerSupabase();
  const created: string[] = [];

  for (const r of rows) {
    const { data: existing } = await supabase
      .from("role_grants")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", r.user_id)
      .eq("role", r.role)
      .eq("nursery_id", r.nursery_id);

    if (!existing || existing.length === 0) {
      const { data: ins, error } = await supabase
        .from("role_grants")
        .insert(r)
        .select("id")
        .single();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (ins?.id) created.push(ins.id);
    } else {
      const id = existing?.[0]?.id;
      if (id) created.push(id);
    }
  }

  const admin = getAdminClient();
  const actorSnap = await resolveActorSnapshot(admin, user.id);

  await audit(admin, {
    org_id: orgId,
    nursery_id: rows.length === 1 ? rows[0].nursery_id : null,
    ...actorSnap,
    action: "staff.grant.add",
    entity_type: "role_grants",
    entity_id: created.length === 1 ? created[0] : null,
    details: {
      target_user_id,
      grants: rows.map((x) => ({ role: x.role, nursery_id: x.nursery_id })),
      grant_ids: created,
    },
  });

  return NextResponse.json({ ok: true, grant_ids: created });
}
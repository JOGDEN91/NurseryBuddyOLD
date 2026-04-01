import { NextResponse } from "next/server";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { getServerSupabase } from "@/lib/supabaseServer";

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function isLikelyEmail(v: string) {
  // Simple sanity check; Supabase will validate further.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
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
    // Best-effort: do not block primary action if audit insert fails.
  }
}

export async function POST(req: Request) {
  const { user, grants } = await getWhoAmI();
  if (!user || !hasRole(grants, "ORG_ADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const orgId = (grants || []).find((g: any) => g.role === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "No organisation context found" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as any));
  const target_user_id = clean(body?.user_id);
  const nextEmail = clean(body?.email).toLowerCase();

  if (!target_user_id || !nextEmail) {
    return NextResponse.json({ ok: false, error: "Missing user_id or email" }, { status: 400 });
  }
  if (!isLikelyEmail(nextEmail)) {
    return NextResponse.json({ ok: false, error: "Invalid email format" }, { status: 400 });
  }

  // Ensure target user belongs to this org.
  const supabase = getServerSupabase();
  const { data: anyGrant, error: grantErr } = await supabase
    .from("role_grants")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", target_user_id)
    .limit(1);

  if (grantErr || !anyGrant || anyGrant.length === 0) {
    return NextResponse.json({ ok: false, error: "User is not a member of this organisation" }, { status: 404 });
  }

  const admin = getAdminClient();

  // Get previous email for auditing
  const { data: uData, error: uErr } = await admin.auth.admin.getUserById(target_user_id);
  if (uErr || !uData?.user) {
    return NextResponse.json({ ok: false, error: uErr?.message ?? "User not found" }, { status: 404 });
  }

  const prevEmail = uData.user.email ?? null;
  if (prevEmail && prevEmail.toLowerCase() === nextEmail) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Update email (admin)
  // Supabase docs: updateUserById can update email. :contentReference[oaicite:3]{index=3}
  // The email_confirm flag is used with updateUserById in practice to control confirmation behaviour. :contentReference[oaicite:4]{index=4}
  const { error: upErr } = await admin.auth.admin.updateUserById(target_user_id, {
    email: nextEmail,
    email_confirm: true,
  } as any);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // Audit snapshot
  const actorSnap = await resolveActorSnapshot(admin, user.id);
  await audit(admin, {
    org_id: orgId,
    nursery_id: null,
    ...actorSnap,
    action: "staff.user.update_email",
    entity_type: "auth.users",
    entity_id: target_user_id,
    details: {
      previous_email: prevEmail,
      new_email: nextEmail,
    },
  });

  return NextResponse.json({ ok: true });
}
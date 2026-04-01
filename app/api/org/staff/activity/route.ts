import { NextResponse } from "next/server";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getAdminClient } from "@/lib/supabaseAdmin";

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

export async function GET(req: Request) {
  const { user, grants } = await getWhoAmI();
  if (!user || !hasRole(grants, "ORG_ADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const orgId = (grants || []).find((g: any) => g.role === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) return NextResponse.json({ ok: false, error: "No organisation context found" }, { status: 400 });

  const url = new URL(req.url);
  const target_user_id = clean(url.searchParams.get("user_id"));
  if (!target_user_id) return NextResponse.json({ ok: false, error: "Missing user_id" }, { status: 400 });

  const admin = getAdminClient();

  // Auth info (best available login info)
  const { data: uData, error: uErr } = await admin.auth.admin.getUserById(target_user_id);
  if (uErr || !uData?.user) {
    return NextResponse.json({ ok: false, error: uErr?.message ?? "User not found" }, { status: 404 });
  }

  // Audit events: those where this user is the target (entity_id) OR actor
  const { data: events, error: evErr } = await admin
    .from("audit_events")
    .select("created_at, action, actor_display_name, actor_email, entity_type, entity_id, details")
    .eq("org_id", orgId)
    .or(`entity_id.eq.${target_user_id},actor_user_id.eq.${target_user_id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (evErr) {
    return NextResponse.json({
      ok: true,
      last_sign_in_at: uData.user.last_sign_in_at ?? null,
      created_at: uData.user.created_at ?? null,
      events: [],
    });
  }

  return NextResponse.json({
    ok: true,
    last_sign_in_at: uData.user.last_sign_in_at ?? null,
    created_at: uData.user.created_at ?? null,
    events: events ?? [],
  });
}
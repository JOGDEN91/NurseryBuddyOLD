import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { getWhoAmI, hasRole } from "@/lib/authz";
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

  const email = clean((body as any).email).toLowerCase();
  const roleRaw = clean((body as any).role) || "NURSERY_MANAGER";
  const role = roleRaw.toUpperCase();

  const first_name = clean((body as any).first_name);
  const surname = clean((body as any).surname);

  // Backward compatible:
  const nursery_id_single = clean((body as any).nursery_id);
  const nursery_ids_in = (body as any).nursery_ids;

  let nursery_ids: string[] = [];
  if (Array.isArray(nursery_ids_in)) {
    nursery_ids = nursery_ids_in.map((x) => clean(x)).filter(Boolean);
  } else if (typeof nursery_ids_in === "string") {
    // allow comma-separated
    nursery_ids = nursery_ids_in
      .split(",")
      .map((x) => clean(x))
      .filter(Boolean);
  } else if (nursery_id_single) {
    nursery_ids = [nursery_id_single];
  }

  if (!email) {
    const msg = "error:Missing email";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const redirectTo = `${siteUrl}/auth/staff/sign-in`;

  const admin = getAdminClient();

  const inviteOptions: any = { redirectTo };
  const meta: Record<string, string> = {};
  if (first_name) meta.first_name = first_name;
  if (surname) meta.surname = surname;
  if (Object.keys(meta).length) inviteOptions.data = meta;

  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (inviteErr) {
    const msg = `error:${inviteErr.message}`;
    return wantsJson(req) ? NextResponse.json({ error: inviteErr.message }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  const invitedUserId = inviteData?.user?.id;
  if (!invitedUserId) {
    const msg = "error:Invite succeeded but no user id returned";
    return wantsJson(req) ? NextResponse.json({ error: msg }, { status: 400 }) : redirectWithMsg(req, msg);
  }

  // Apply scope rules:
  // - ORG_ADMIN: always org-wide (nursery_id null)
  // - else: if no nurseries given => org-wide; else create one grant per nursery
  const supabase = getServerSupabase();

  const createRows: Array<{ user_id: string; role: string; org_id: string; nursery_id: string | null }> = [];
  if (role === "ORG_ADMIN") {
    createRows.push({ user_id: invitedUserId, role, org_id: orgId, nursery_id: null });
  } else if (!nursery_ids || nursery_ids.length === 0) {
    createRows.push({ user_id: invitedUserId, role, org_id: orgId, nursery_id: null });
  } else {
    const uniq = Array.from(new Set(nursery_ids));
    for (const id of uniq) {
      createRows.push({ user_id: invitedUserId, role, org_id: orgId, nursery_id: id });
    }
  }

  // Insert (best effort de-dup) by checking existing per row
  const createdGrantIds: string[] = [];
  for (const row of createRows) {
    const { data: existing } = await supabase
      .from("role_grants")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", invitedUserId)
      .eq("role", row.role)
      .eq("nursery_id", row.nursery_id);

    if (!existing || existing.length === 0) {
      const { data: inserted, error } = await supabase
        .from("role_grants")
        .insert(row)
        .select("id")
        .single();

      if (error) {
        const msg = `error:${error.message}`;
        return wantsJson(req) ? NextResponse.json({ error: error.message }, { status: 400 }) : redirectWithMsg(req, msg);
      }
      if (inserted?.id) createdGrantIds.push(inserted.id);
    } else {
      const id = existing?.[0]?.id;
      if (id) createdGrantIds.push(id);
    }
  }

  // Audit snapshot
  const actorSnap = await resolveActorSnapshot(admin, user.id);
  await audit(admin, {
    org_id: orgId,
    nursery_id: createRows.length === 1 ? createRows[0].nursery_id : null,
    ...actorSnap,
    action: "staff.invite",
    entity_type: "auth.users",
    entity_id: invitedUserId,
    details: {
      invited_email: email,
      invited_first_name: first_name || null,
      invited_surname: surname || null,
      grants: createRows.map((r) => ({ role: r.role, nursery_id: r.nursery_id })),
      grant_ids: createdGrantIds,
    },
  });

  return wantsJson(req) ? NextResponse.json({ ok: true }) : redirectWithMsg(req, "invited");
}
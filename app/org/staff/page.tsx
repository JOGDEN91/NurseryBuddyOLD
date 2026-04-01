import StaffClient from "./StaffClient";
import { getWhoAmI, hasRole } from "@/lib/authz";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { getServerSupabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function cleanNamePart(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function displayNameFromAuth(u: any): { displayName: string; first_name: string; surname: string } {
  const meta = u?.user_metadata ?? u?.raw_user_meta_data ?? {};
  const first_name = cleanNamePart(meta?.first_name);
  const surname = cleanNamePart(meta?.surname);
  const full = `${first_name} ${surname}`.trim();
  return { displayName: full, first_name, surname };
}

function statusFromAuth(u: any): { label: "Invited" | "Active" | "Disabled"; lastActive: string } {
  const bannedUntil = u?.banned_until ? new Date(u.banned_until) : null;
  if (bannedUntil && bannedUntil.getTime() > Date.now()) {
    return { label: "Disabled", lastActive: fmtDateTime(u?.last_sign_in_at ?? null) };
  }
  if (u?.last_sign_in_at) {
    return { label: "Active", lastActive: fmtDateTime(u.last_sign_in_at) };
  }
  return { label: "Invited", lastActive: "Never" };
}

export default async function OrgStaffPage() {
  const { user, grants } = await getWhoAmI();
  if (!user || !hasRole(grants, "ORG_ADMIN")) {
    return (
      <div style={{ padding: 16, opacity: 0.8 }}>
        You do not have permission to view this page.
      </div>
    );
  }

  const orgId = (grants || []).find((g: any) => g.role === "ORG_ADMIN")?.org_id ?? null;
  if (!orgId) {
    return (
      <div style={{ padding: 16, opacity: 0.8 }}>
        No organisation context found for this account.
      </div>
    );
  }

  const supabase = getServerSupabase();

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const { data: grantRows, error: grantsErr } = await supabase
    .from("role_grants")
    .select("id, user_id, role, nursery_id, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (grantsErr) {
    return (
      <div style={{ padding: 16, color: "#B00020" }}>
        Error loading staff: {grantsErr.message}
      </div>
    );
  }

  const nurseryList = (nurseries ?? []) as Array<{ id: string; name: string }>;
  const nurseryMap = Object.fromEntries(nurseryList.map((n) => [n.id, n.name]));

  // Auth enrichment for email + last_sign_in_at + metadata name
  const admin = getAdminClient();
  const userIds = Array.from(new Set((grantRows ?? []).map((g: any) => g.user_id).filter(Boolean)));
  const authById = new Map<string, any>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (!error && data?.user) authById.set(id, data.user);
    })
  );

  // Group grants per user
  const grantsByUser = new Map<string, any[]>();
  for (const g of grantRows ?? []) {
    const k = g.user_id ?? "unknown";
    const arr = grantsByUser.get(k) ?? [];
    arr.push(g);
    grantsByUser.set(k, arr);
  }

  const people = Array.from(grantsByUser.entries()).map(([uid, gs]) => {
    const au = authById.get(uid);
    const email = au?.email ?? "—";
    const st = statusFromAuth(au);
    const nm = displayNameFromAuth(au);

    return {
      user_id: uid,
      email,
      name: nm.displayName,
      first_name: nm.first_name,
      surname: nm.surname,
      status: st.label,
      lastActive: st.lastActive,
      grants: gs,
    };
  });

  const allRoles = Array.from(new Set((grantRows ?? []).map((g: any) => g.role))).sort();

  return (
    <StaffClient
      orgId={orgId}
      nurseries={nurseryList}
      nurseryMap={nurseryMap}
      people={people}
      allRoles={allRoles}
    />
  );
}
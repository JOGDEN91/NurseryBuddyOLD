// lib/authz.ts
import { getServerSupabase } from "./supabaseServer";

export type AppRole = "SUPER_ADMIN" | "ORG_ADMIN" | "NURSERY_MANAGER" | "PARENT";

export type Grant = {
  user_id: string;
  role: AppRole;
  org_id: string | null;
  nursery_id: string | null;
};

export async function getWhoAmI() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, grants: [] as Grant[] };

  const { data: grants } = await supabase
    .from("role_grants")
    .select("user_id, role, org_id, nursery_id")
    .eq("user_id", user.id);

  return { user, grants: (grants ?? []) as Grant[] };
}

export function hasRole(grants: Grant[], role: AppRole) {
  return grants.some(g => g.role === role);
}

export function firstOrgIdFor(grants: Grant[], role: AppRole) {
  return grants.find(g => g.role === role && g.org_id)?.org_id ?? null;
}

export function firstNurseryIdFor(grants: Grant[], role: AppRole) {
  return grants.find(g => g.role === role && g.nursery_id)?.nursery_id ?? null;
}

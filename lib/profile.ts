// lib/profile.ts
import { createServerSupabase } from "@/lib/supabase/server";

type Profile = {
  id: string;
  display_name: string | null;
  role: string | null;
  nursery_id: string | null;
  organisation_id: string | null;
};

export async function getCurrentUserAndProfile(): Promise<{
  user: { id: string; email?: string | null } | null;
  profile: Profile | null;
}> {
  const supabase = createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user?.id) return { user: null, profile: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, nursery_id, organisation_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Per UX pattern: don’t crash; return user + null profile on read failures
    return { user: { id: user.id, email: user.email }, profile: null };
  }

  return { user: { id: user.id, email: user.email }, profile: (profile as Profile) ?? null };
}

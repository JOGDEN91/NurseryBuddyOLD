import { createSupabaseServer } from "@/lib/supabase/server";

export async function getMyReminders() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("app_reminders")
    .select("*")
    .eq("assignee_id", user.id)
    .order("due_at", { ascending: true });
  return data || [];
}

export async function getNurseryReminders() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from("app_profiles").select("*").eq("id", user.id).single();
  if (profile?.role !== "staff" || !profile?.nursery_id) return [];
  const { data } = await supabase
    .from("app_reminders")
    .select("*, assignee:assignee_id ( id )")
    .order("due_at", { ascending: true });
  return data || [];
}

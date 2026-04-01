import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import ProfileForm from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <p>Please <Link href="/auth/sign-in">sign in</Link>.</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("app_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 520 }}>
      <h1>My Profile</h1>
      <ProfileForm initialDisplayName={profile?.display_name ?? ""} initialNurseryId={profile?.nursery_id ?? ""} />
      <div>
        <h3>Current</h3>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 8 }}>
{JSON.stringify(profile, null, 2)}
        </pre>
        <p><a href="/supabase/me">See raw auth & profile</a></p>
      </div>
    </main>
  );
}
"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AdminSignOutButton() {
  const supabase = createClientComponentClient();

  async function handle() {
    await supabase.auth.signOut();
    window.location.assign("/admin/sign-in");
  }

  return (
    <button onClick={handle} className="text-sm underline opacity-80 hover:opacity-100">
      Sign out
    </button>
  );
}

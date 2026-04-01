import { getCurrentUserAndProfile } from "@/lib/profile";
import Link from "next/link";
import ReminderList from "@/components/ReminderList";
import FileUpload from "@/components/FileUpload";
import FileList from "@/components/FileList";
import ChildForm from "@/components/ChildForm";
import ParentChecklist from "@/components/ParentChecklist";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const { user, profile } = await getCurrentUserAndProfile();

// ...
<div style={{ display: "flex", gap: 12 }}>
  <SignOutButton />
</div>

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1>Parent Dashboard</h1>
      {user && <p style={{ opacity: 0.8 }}>Signed in as <b>{user.email}</b></p>}

      {profile && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div>Role: <b>{profile.role}</b></div>
          <div>Display name: <b>{profile.display_name || "—"}</b></div>
          <div>Nursery ID: <b>{profile.nursery_id || "—"}</b></div>
        </div>
      )}

      {/* NEW: parent uploads + their documents (read-only; no delete button shown) */}
      <ChildForm />  
      <FileUpload />
      <FileList />
      <ParentChecklist />

      {/* Reminders are visible but read-only for parents */}
      <ReminderList mode="self" readOnly />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/account/profile">Edit profile</Link>
        <Link href="/supabase/me">Debug: /supabase/me</Link>
      </div>
    </main>
  );
}
// app/parent/profile/page.tsx
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";

export default function ParentProfilePage() {
  return <ProfileClient />;
}

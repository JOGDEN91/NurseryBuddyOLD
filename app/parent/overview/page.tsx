import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FileList from "@/components/files/FileList";
import FileUpload from "@/components/files/FileUpload";
import ReminderList from "@/components/reminders/ReminderList";

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};

export default async function ParentOverviewPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any | undefined; // { id, email, name, ... }
  const email = user?.email ?? "—";
  const displayName = user?.name ?? user?.displayName ?? "—";

  // Child count is optional; show "—" if you don't already populate this.
  const childCount: number | string =
    (user?.childCount as number | undefined) ?? "—";

  return (
    <div className="twoCol">
      {/* LEFT */}
      <section className="leftCol">
        {/* Parent info (compact) */}
        <div style={{ ...cardStyle, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Parent info</div>
          <div style={{ display: "grid", gap: 4 }}>
            <div><strong>Email:</strong> {email}</div>
            <div><strong>Display name:</strong> {displayName}</div>
            <div><strong>Children:</strong> {childCount}</div>
          </div>
        </div>

        {/* Documents (upload + filtered list) */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Documents</div>
            {/* Upload to the parent's own area; optional child_id/doc_type supported by FileUpload */}
            <FileUpload ownerId={user?.id} defaultDocType="parent_upload" />
          </div>

          {/* Only show the current user's files */}
          <FileList mineOnly ownerId={user?.id} />
        </div>
      </section>

      {/* RIGHT */}
      <section className="rightCol">
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>My reminders</div>
          <ReminderList mode="self" readOnly />
        </div>
      </section>
    </div>
  );
}
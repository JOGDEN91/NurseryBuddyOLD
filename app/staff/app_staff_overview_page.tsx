import StaffCard from "@/components/StaffCard";
import { getCurrentUserAndProfile } from "@/lib/profile";
import ReminderList from "@/components/ReminderList";
import FileList from "@/components/FileList";
import FundingTermBar from "@/components/funding/FundingTermBar";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/* ---------------- Types ---------------- */
type MiniChild = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  parent_email?: string | null;
};

type ChildLite = { first_name: string; last_name: string; date_of_birth?: string | null };
type CodeLite = { code?: string | null; code_type?: string | null; expires_on?: string | null; status?: string | null };
type Enrol = {
  id: string;
  status: "pending" | "updated" | "verified" | "rejected";
  stretch: boolean;
  weeks: number | null;
  total_hours_week: number | null;
  child?: ChildLite;
  code?: CodeLite;
};

type TermBlock = {
  term: { id: string; name: string; start_date: string; end_date: string };
  groups: { pending: Enrol[]; updated: Enrol[]; verified: Enrol[]; rejected: Enrol[] };
};

type BoardResponse = { current: TermBlock | null; next: TermBlock | null };

/* ---------------- Helpers ---------------- */
async function fetchFundingBoard(): Promise<BoardResponse> {
  // Build absolute URL for server-side fetch
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;
  const url = new URL("/api/funding/board", base);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { current: null, next: null };
  return res.json();
}

/* ---------------- Donut (single) ---------------- */
function Donut({
  size = 120,
  stroke = 14,
  segments,
  total,
}: {
  size?: number;
  stroke?: number;
  segments: { value: number; color: string; label: string }[];
  total: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const isEmpty = total <= 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Funding progress">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#EFEDE9" strokeWidth={stroke} fill="none" />
      {!isEmpty && (() => {
        let offset = 0;
        const safeTotal = total || 1;
        return segments.map((seg, idx) => {
          const len = Math.max(0, Math.min(1, seg.value / safeTotal)) * c;
          const dasharray = `${len} ${c - len}`;
          const el = (
            <circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={seg.color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        });
      })()}
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        style={{ fontSize: 18, fontWeight: 800, fill: "#24364B" }}
      >
        {isEmpty
          ? "—"
          : `${Math.round((((segments.find(s => s.label === "Verified")?.value ?? 0)) / (total || 1)) * 100)}%`}
      </text>
      <text
        x="50%"
        y="50%"
        dy="1.2em"
        dominantBaseline="middle"
        textAnchor="middle"
        style={{ fontSize: 11, fill: "#6C7A89" }}
      >
        verified
      </text>
    </svg>
  );
}

/* ---------------- Snapshot card ---------------- */
function FundingSnapshotCard({ title, block }: { title: string; block: TermBlock | null }) {
  let total = 0, verified = 0, expired = 0, pending = 0;
  let subline: React.ReactNode = null;

  if (block) {
    const { groups, term } = block;
    const all: Enrol[] = [
      ...(groups?.pending ?? []),
      ...(groups?.updated ?? []),
      ...(groups?.verified ?? []),
      ...(groups?.rejected ?? []),
    ];
    total = all.length;
    verified = groups?.verified?.length ?? 0;
    expired = all.filter((e) => e.code?.status === "expired").length;
    const renewalDue = all.filter((e) => e.code?.status === "renewal_due").length;
    const rawPending = (groups?.pending?.length ?? 0) + (groups?.updated?.length ?? 0);
    pending = rawPending + renewalDue;

    subline = (
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {term.name}: {term.start_date} → {term.end_date}
      </div>
    );
  } else {
    subline = <div style={{ opacity: 0.7 }}>No term set.</div>;
  }

  const segments = [
    { label: "Verified", value: verified, color: "#4CAF78" }, // green
    { label: "Pending",  value: pending,  color: "#F0A500" }, // amber
    { label: "Expired",  value: expired,  color: "#E35656" }, // red
  ];

  return (
    <div style={{ height: "100%" }}>
      <StaffCard title={title}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "center" }}>
          <Donut size={120} stroke={14} segments={segments} total={total} />
          <div style={{ display: "grid", gap: 8 }}>
            {subline}
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, max-content)" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: "#4CAF78", display: "inline-block" }} />
                <span style={{ fontSize: 13 }}>Verified: <b>{verified}</b></span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: "#F0A500", display: "inline-block" }} />
                <span style={{ fontSize: 13 }}>Pending: <b>{pending}</b></span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: "#E35656", display: "inline-block" }} />
                <span style={{ fontSize: 13 }}>Expired: <b>{expired}</b></span>
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Total funded children: <b>{total}</b>
            </div>
            <div>
              <a href="/staff/funding" style={{ textDecoration: "underline" }}>Open Funding</a>
            </div>
          </div>
        </div>
      </StaffCard>
    </div>
  );
}

/* ---------------- Children mini list ---------------- */
async function ChildrenMiniList() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;
  const url = new URL("/api/children", base);
  url.searchParams.set("nursery", "mine");
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    return (
      <StaffCard title="Children (nursery)" noStretch>
        <div style={{ opacity: 0.7 }}>Couldn’t load children.</div>
        <div style={{ marginTop: 10 }}>
          <a href="/staff/children" style={{ textDecoration: "underline" }}>Open full list</a>
        </div>
      </StaffCard>
    );
  }

  const data = await res.json();
  const items = (data?.children ?? []) as MiniChild[];

  return (
    <StaffCard title="Children (nursery)" noStretch>
      {items.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No children yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 6 }}>
          {items.map((c) => (
            <li key={c.id}>
              {c.first_name} {c.last_name}
              {c.date_of_birth ? <span style={{ opacity: 0.6 }}> — {c.date_of_birth}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 10 }}>
        <a href="/staff/children" style={{ textDecoration: "underline" }}>View all children</a>
      </div>
    </StaffCard>
  );
}

/* ---------------- Page ---------------- */
export default async function OverviewPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  const board = await fetchFundingBoard();

  return (
    <div
      className="staffOverviewGrid"
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "1fr 380px", // left column + right rail
      }}
    >
      {/* LEFT COLUMN */}
      <div style={{ display: "grid", gap: 16 }}>
        {/* Staff info */}
        <StaffCard title="Staff info" variant="compact" noStretch>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              rowGap: 4,
              columnGap: 12,
              alignItems: "center",
              fontSize: 14,
              lineHeight: 1.2,
            }}
          >
            <div style={{ opacity: 0.7 }}>Signed in</div>
            <div><b>{user?.email}</b></div>

            <div style={{ opacity: 0.7 }}>Role</div>
            <div><b>{profile?.role ?? "—"}</b></div>

            <div style={{ opacity: 0.7 }}>Display name</div>
            <div>{profile?.display_name ?? "—"}</div>

            <div style={{ opacity: 0.7 }}>Nursery ID</div>
            <div style={{ wordBreak: "break-word" }}>{profile?.nursery_id ?? "—"}</div>
          </div>
        </StaffCard>

        {/* Toolbar above the two term cards */}
        <FundingTermBar />

        {/* Funding snapshots side-by-side */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1fr 1fr",
            alignItems: "stretch",
          }}
        >
          <FundingSnapshotCard title="Current term" block={board.current} />
          <FundingSnapshotCard title="Next term" block={board.next} />
        </div>

        {/* Children mini list */}
        {await ChildrenMiniList()}

        {/* Documents grouped by status */}
        <StaffCard title="Documents" noStretch>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Pending review</div>
              <FileList status="pending" limit={5} compactEmpty />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Approved</div>
              <FileList status="approved" limit={5} compactEmpty />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Rejected</div>
              <FileList status="rejected" limit={5} compactEmpty />
            </div>
            <div>
              <a href="/staff/documents" style={{ textDecoration: "underline" }}>View all documents</a>
            </div>
          </div>
        </StaffCard>
      </div>

      {/* RIGHT COLUMN — reminders rail */}
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <StaffCard title="Nursery reminders" noStretch>
          <ReminderList mode="nursery" />
        </StaffCard>
      </div>
    </div>
  );
}
"use client";

import StaffCard from "@/components/StaffCard";
import ReminderList from "@/components/ReminderList";
import FileList from "@/components/FileList";
import CreateTermClient from "@/app/staff/overview/CreateTermClient";

type TermLite = { id: string; name: string; start_date: string; end_date: string } | null;
type Starter = { id: string; first_name: string; last_name: string; start_date: string | null };
type Leaver  = { id: string; first_name: string; last_name: string; end_date: string | null };

export type OverviewProps = {
  staffInfo: {
    email: string | null;
    role: string | null;
    displayName: string | null;
    orgNursery: string;
  };
  board: {
    current: { term: TermLite } | null;
    next:    { term: TermLite } | null;
  };
  starters: Starter[];
  leavers:  Leaver[];
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#EFEDE9" strokeWidth={stroke} fill="none" />
      {!isEmpty && (() => {
        let offset = 0;
        const safeTotal = total || 1;
        return segments.map((seg, i) => {
          const len = Math.max(0, Math.min(1, seg.value / safeTotal)) * c;
          const dasharray = `${len} ${c - len}`;
          const el = (
            <circle
              key={i}
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
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: "#24364B" }}>
        {isEmpty ? "—" : `${Math.round((((segments.find(s => s.label === "Verified")?.value ?? 0)) / (total || 1)) * 100)}%`}
      </text>
      <text x="50%" y="50%" dy="1.2em" dominantBaseline="middle" textAnchor="middle" style={{ fontSize: 11, fill: "#6C7A89" }}>
        verified
      </text>
    </svg>
  );
}

function FundingSnapshotCard({ title, block }: { title: string; block: any }) {
  let total = 0, verified = 0, expired = 0, pending = 0;
  let subline: React.ReactNode = <div style={{ opacity: 0.7 }}>No term set.</div>;
  if (block) {
    const { groups, term } = block;
    const all: any[] = [
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
    subline = term ? (
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {term.name}: {term.start_date} → {term.end_date}
      </div>
    ) : <div style={{ fontSize: 13, opacity: 0.8 }}>—</div>;
  }
  const segments = [
    { label: "Verified", value: verified, color: "#4CAF78" },
    { label: "Pending",  value: pending,  color: "#F0A500" },
    { label: "Expired",  value: expired,  color: "#E35656" },
  ];
  return (
    <StaffCard title={title}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "center" }}>
        <Donut size={120} stroke={14} segments={segments} total={total} />
        <div style={{ display: "grid", gap: 8 }}>
          {subline}
          <div style={{ fontSize: 12, opacity: 0.75 }}>Total funded children: <b>{total}</b></div>
          <div><a href="/org/funding" style={{ textDecoration: "underline" }}>Open Funding</a></div>
        </div>
      </div>
    </StaffCard>
  );
}

export default function OverviewDashboard(props?: Partial<OverviewProps>) {
  const staff = props?.staffInfo ?? { email: null, role: null, displayName: null, orgNursery: "—" };
  const board = props?.board ?? { current: null, next: null };
  const starters = props?.starters ?? [];
  const leavers  = props?.leavers  ?? [];

  return (
    <div style={{ display:"grid", gap:16, gridTemplateColumns:"1fr 380px" }}>
      {/* LEFT COLUMN */}
      <div style={{ display:"grid", gap:16 }}>
        {/* Staff info */}
        <StaffCard title="Staff info" variant="compact" noStretch>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              rowGap: 6,
              columnGap: 12,
              fontSize: 14,
              lineHeight: 1.2,
            }}
          >
            <div style={{ opacity: 0.7 }}>Signed in</div>
            <div><b>{staff.email ?? "—"}</b></div>

            <div style={{ opacity: 0.7 }}>Role</div>
            <div><b>{staff.role ?? "—"}</b></div>

            <div style={{ opacity: 0.7 }}>Display name</div>
            <div>{staff.displayName ?? "—"}</div>

            <div style={{ opacity: 0.7 }}>Organisation / Nursery</div>
            <div>{staff.orgNursery}</div>
          </div>
        </StaffCard>

        {/* Create term (client modal) */}
        <StaffCard title="Terms" noStretch>
          <CreateTermClient />
        </StaffCard>

        {/* Snapshots */}
        <div style={{ display:"grid", gap:16, gridTemplateColumns:"1fr 1fr" }}>
          <FundingSnapshotCard title="Current term" block={board.current} />
          <FundingSnapshotCard title="Next term" block={board.next} />
        </div>

        {/* Starters / Leavers */}
        <div style={{ display:"grid", gap:16, gridTemplateColumns:"1fr 1fr" }}>
          <StaffCard title="New Starters" noStretch>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>Child</th>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>Start date</th>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {starters.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding:10, opacity:0.7 }}>No records</td></tr>
                ) : starters
                  .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))
                  .map((c) => (
                    <tr key={c.id} style={{ borderTop:"1px solid #F4F2EF" }}>
                      <td style={{ padding:8 }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding:8 }}>{fmt(c.start_date)}</td>
                      <td style={{ padding:8 }}>
                        <a href={`/org/funding?q=${encodeURIComponent(`${c.first_name} ${c.last_name}`.trim())}`} className="underline">
                          View in Funding
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </StaffCard>

          <StaffCard title="Leavers" noStretch>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>Child</th>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>End date</th>
                  <th style={{ textAlign:"left", padding:8, borderBottom:"1px solid #EEE" }}>Headcount status</th>
                </tr>
              </thead>
              <tbody>
                {leavers.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding:10, opacity:0.7 }}>No records</td></tr>
                ) : leavers
                  .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
                  .map((c) => (
                    <tr key={c.id} style={{ borderTop:"1px solid #F4F2EF" }}>
                      <td style={{ padding:8 }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding:8 }}>{fmt(c.end_date)}</td>
                      <td style={{ padding:8 }}>
                        <select
                          defaultValue="outstanding"
                          style={{
                            padding:"2px 8px",
                            borderRadius:999,
                            border:"1px solid #E5E7EB",
                            background:"#FDECEC",
                            color:"#8A1F1F",
                            fontWeight:700
                          }}
                          onChange={(e)=>{
                            const v = e.target.value;
                            e.currentTarget.style.background = v === "removed" ? "#E6F5EE" : "#FDECEC";
                            e.currentTarget.style.color = v === "removed" ? "#1F7A55" : "#8A1F1F";
                          }}
                        >
                          <option value="outstanding">outstanding</option>
                          <option value="removed">removed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </StaffCard>
        </div>

        {/* Documents */}
        <StaffCard title="Documents" noStretch>
          <div style={{ display:"grid", gap:12 }}>
            <div>
              <div style={{ fontWeight:700, marginBottom:6 }}>To be approved</div>
              <FileList status="pending" limit={5} compactEmpty />
            </div>
            <div>
              <div style={{ fontWeight:700, marginBottom:6 }}>Still outstanding</div>
              <FileList status="requested" limit={5} compactEmpty />
              <div style={{ height:8 }} />
              <FileList status="review" limit={5} compactEmpty />
            </div>
            <div>
              <a href="/org/documents" style={{ textDecoration:"underline" }}>Open Documents</a>
            </div>
          </div>
        </StaffCard>
      </div>

      {/* RIGHT COLUMN — reminders rail */}
      <div style={{ display:"grid", gap:16, alignContent:"start" }}>
        <StaffCard title="Nursery reminders" noStretch>
          <ReminderList mode="nursery" />
        </StaffCard>
      </div>
    </div>
  );
}

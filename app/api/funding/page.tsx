import { headers } from "next/headers";

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

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 16,
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#333",
  fontWeight: 600,
  cursor: "pointer",
};

function formatMask(code?: string | null) {
  if (!code) return "—";
  const tail = code.slice(-4);
  return "••••" + tail;
}

async function fetchBoard() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;
  const url = new URL("/api/funding/board", base);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { current: null, next: null };
  return res.json();
}

async function markVerified(id: string) {
  // This runs on the server (Server Component) so we can't call directly.
  // Instead we'll render a form that POSTs to an action route or use <form action>.
  // For now we expose a client-side button; see inline <form>.
}

function Column({ title, items }: { title: string; items: Enrol[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.9 }}>{title} ({items.length})</div>
      {items.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 13 }}>No records.</div>
      ) : (
        items.map((e) => (
          <div key={e.id} style={{ border: "1px solid #EEE", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>
              {e.child?.first_name} {e.child?.last_name}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>Total/wk: <b>{e.total_hours_week ?? "—"}</b></span>
              <span>Stretch: <b>{e.stretch ? "Yes" : "No"}</b>{e.weeks ? ` (${e.weeks}w)` : ""}</span>
              <span>Code: <b>{formatMask(e.code?.code)}</b> ({e.code?.code_type ?? "—"})</span>
              <span>Expires: <b>{e.code?.expires_on ?? "—"}</b></span>
              <span>Code status: <b>{e.code?.status ?? "—"}</b></span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <a href={`/child/${/* if you have child routes */ ""}`} style={{ ...btnGhost, textDecoration: "none" }}>Open</a>

              {/* Mark verified button posts to API from client (simple) */}
              {/* Use a tiny inline form so no extra client bundle needed */}
              {e.status !== "verified" && (
                <form action={`/api/funding/enrolments/${e.id}/verify`} method="post"
                      onSubmit={(ev) => {
                        // convert POST to PATCH via _method or use fetch in client; simplest: method=post accepted by route with PATCH -> adjust if needed
                      }}>
                  <button
                    formAction={`/api/funding/enrolments/${e.id}/verify`}
                    formMethod="post"
                    style={btn}
                  >
                    Mark verified
                  </button>
                </form>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default async function FundingBoardPage() {
  const data = await fetchBoard();

  function Board({ side }: { side: "current" | "next" }) {
    const block = (data as any)?.[side];
    if (!block) {
      return (
        <div style={card}>
          <div style={{ fontWeight: 800 }}>{side === "current" ? "Current term" : "Next term"}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>No term set.</div>
        </div>
      );
    }
    const { term, groups } = block as { term: any; groups: Record<string, Enrol[]> };

    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontWeight: 800 }}>{term.name}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {term.start_date} → {term.end_date}
          </div>
        </div>

        {/* 3 columns board */}
        <div style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, 1fr)",
        }}>
          <Column title="Pending"  items={groups?.pending  ?? []} />
          <Column title="Updated"  items={groups?.updated  ?? []} />
          <Column title="Verified" items={groups?.verified ?? []} />
          {/* Optionally add <Column title="Rejected" items={groups?.rejected ?? []} /> */}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      <Board side="current" />
      <Board side="next" />
    </div>
  );
}
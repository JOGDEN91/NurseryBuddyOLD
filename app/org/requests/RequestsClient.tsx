// app/org/requests/RequestsClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 12,
};
const inputCss: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
};
const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

type Row = {
  id: string;
  nursery_id: string;
  child_id: string;
  term_id: string | null;
  child_name: string | null;
  type: string | null;
  type_label?: string | null;
  status: string | null;
  updated_at: string | null;
};

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  try {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return s ?? "—";
    return dt.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s ?? "—";
  }
}

export default function RequestsClient() {
  const { nurseryId } = useScope();

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!nurseryId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("nursery_id", nurseryId);
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/requests/list?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        console.error("requests/list error", j?.error);
        setRows([]);
      } else {
        setRows((j.items ?? []) as Row[]);
      }
    } catch (e) {
      console.error("requests/list fetch error", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const child = (r.child_name ?? "").toLowerCase();
      const type = (r.type_label ?? r.type ?? "").toLowerCase();
      const status = (r.status ?? "").toLowerCase();
      return child.includes(t) || type.includes(t) || status.includes(t);
    });
  }, [rows, q]);

  const active = filtered.filter(
    (r) =>
      (r.status ?? "open") === "open" ||
      (r.status ?? "open") === "in_progress"
  );
  const completed = filtered.filter(
    (r) => r.status === "accepted" || r.status === "rejected"
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Toolbar */}
      <div style={{ ...card }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 800 }}>Requests</div>
            <div style={{ fontSize: 11, color: "#6C7A89", marginTop: 2 }}>
              Live tasks from documents, parent changes, and funding
              declarations.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by child/type/status…"
              style={{ ...inputCss, minWidth: 260 }}
            />
            <button onClick={load} style={btn}>
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Active requests */}
      <div style={{ ...card }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 4,
          }}
        >
          Active requests
        </div>
        {loading ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Loading requests…
          </div>
        ) : active.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            No active requests.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <Th>Child / Household</Th>
                <Th>Request type</Th>
                <Th>Status</Th>
                <Th>Last updated</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={r.id}>
                  <Td>{r.child_name || "—"}</Td>
                  <Td>{r.type_label || r.type || "Request"}</Td>
                  <Td>{r.status || "open"}</Td>
                  <Td>{fmtDateTime(r.updated_at)}</Td>
                  <Td>
                    {/* Funding declarations: just a View link */}
                    {r.type === "child_declaration" ? (
                      <a
                        href={
                          r.term_id
                            ? `/org/declarations?term_id=${encodeURIComponent(
                                r.term_id
                              )}`
                            : "/org/declarations"
                        }
                        style={btn}
                      >
                        View
                      </a>
                    ) : (
                      <>
                        {/* Approve / Decline for other request types */}
                        <form
                          action="/api/requests/approve"
                          method="POST"
                          style={{ display: "inline-block", marginRight: 6 }}
                        >
                          <input
                            type="hidden"
                            name="request_id"
                            value={r.id}
                          />
                          <button style={btnPrimary}>Approve</button>
                        </form>
                        <form
                          action="/api/requests/decline"
                          method="POST"
                          style={{ display: "inline-block" }}
                        >
                          <input
                            type="hidden"
                            name="request_id"
                            value={r.id}
                          />
                          <button style={btn}>Decline</button>
                        </form>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Completed requests */}
      <div style={{ ...card }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 4,
          }}
        >
          Completed
        </div>
        {loading ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Loading…
          </div>
        ) : completed.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            No completed requests yet.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <Th>Child / Household</Th>
                <Th>Request type</Th>
                <Th>Status</Th>
                <Th>Last updated</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {completed.map((r) => (
                <tr key={r.id}>
                  <Td>{r.child_name || "—"}</Td>
                  <Td>{r.type_label || r.type || "Request"}</Td>
                  <Td>{r.status || "accepted"}</Td>
                  <Td>{fmtDateTime(r.updated_at)}</Td>
                  <Td>
                    {r.type === "child_declaration" && (
                      <a
                        href={
                          r.term_id
                            ? `/org/declarations?term_id=${encodeURIComponent(
                                r.term_id
                              )}`
                            : "/org/declarations"
                        }
                        style={btn}
                      >
                        View
                      </a>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: 10,
        borderBottom: "1px solid #E6E4E0",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  ...rest
}: React.DetailedHTMLProps<
  React.TdHTMLAttributes<HTMLTableCellElement>,
  HTMLTableCellElement
>) {
  return (
    <td
      style={{ padding: 10, borderBottom: "1px solid #F3F3F3" }}
      {...rest}
    >
      {children}
    </td>
  );
}
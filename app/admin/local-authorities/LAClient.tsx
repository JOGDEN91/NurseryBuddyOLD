"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLAImportClient from "./AdminLAImportClient";

type Row = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  public_url: string | null;
  portal_url: string | null;
  is_active: boolean | null;
  last_reviewed_at: string | null;

  // New numeric fields provided by the server page
  la_rates_count?: number;
  la_term_dates_count?: number;
  la_documents_count?: number;
  la_claim_windows_count?: number;
  la_payment_schedule_count?: number;
  la_supplements_count?: number;

  // Back-compat (if older server still returns nested counts)
  la_rates?: { count: number | null }[];
  la_term_dates?: { count: number | null }[];
};

export default function LAClient({
  las,
  serverError,
}: {
  las: Row[];
  serverError?: string | null;
}) {
  const router = useRouter();

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <AdminLAImportClient refresh={() => router.refresh()} />
        <ValidateLinks />
      </div>

      {serverError && (
        <div
          style={{
            padding: 10,
            border: "1px solid #e5a7a7",
            background: "#fff5f5",
            color: "#8c2d2d",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Data load warning: {serverError}
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E4E0",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <LATable las={las} />
      </div>
    </div>
  );
}

function getCount(row: Row, key: keyof Row, fallbackKey?: keyof Row) {
  const v = (row as any)[key];
  if (typeof v === "number") return v;
  if (fallbackKey && Array.isArray((row as any)[fallbackKey])) {
    const a = (row as any)[fallbackKey] as { count: number | null }[];
    return a?.[0]?.count ?? 0;
  }
  return 0;
}

function LATable({ las }: { las: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return las;
    return las.filter((la) =>
      [la.name, la.country ?? "", la.region ?? "", la.public_url ?? "", la.portal_url ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [las, q]);

  return (
    <>
      <div style={{ padding: 10, borderBottom: "1px solid #EEE", display: "flex", gap: 8 }}>
        <input
          placeholder="Search by name, country, region, or URL…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={{ padding: "8px 10px", border: "1px solid #DADADA", borderRadius: 8, flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        <span style={{ fontSize: 13, opacity: 0.7, alignSelf: "center" }}>
          {filtered.length} of {las.length}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead style={{ background: "#FAFAFA" }}>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Country</th>
            <th style={th}>Region</th>
            <th style={th} title="Base funding rates">Rates</th>
            <th style={th} title="Term date rows">Terms</th>
            <th style={th} title="Provider agreements & docs">Docs</th>
            <th style={th} title="Claim windows">Win</th>
            <th style={th} title="Payment schedule entries">Pay</th>
            <th style={th} title="Supplements (e.g. deprivation)">Supp</th>
            <th style={th}>Public</th>
            <th style={th}>Portal</th>
            <th style={th}>Active</th>
            <th style={th}>Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((la) => (
            <tr key={la.id} style={{ borderTop: "1px solid #F3F3F3" }}>
              <td style={td}>
                <Link
                  href={`/admin/local-authorities/${la.id}`}
                  style={{ textDecoration: "none", color: "#0B66D6", fontWeight: 600 }}
                >
                  {la.name}
                </Link>
              </td>
              <td style={td}>{la.country ?? "—"}</td>
              <td style={td}>{la.region ?? "—"}</td>
              <td style={td}>{getCount(la, "la_rates_count", "la_rates")}</td>
              <td style={td}>{getCount(la, "la_term_dates_count", "la_term_dates")}</td>
              <td style={td}>{getCount(la, "la_documents_count")}</td>
              <td style={td}>{getCount(la, "la_claim_windows_count")}</td>
              <td style={td}>{getCount(la, "la_payment_schedule_count")}</td>
              <td style={td}>{getCount(la, "la_supplements_count")}</td>
              <td style={td}>
                {la.public_url ? (
                  <a href={la.public_url} target="_blank" rel="noreferrer">
                    open
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td style={td}>
                {la.portal_url ? (
                  <a href={la.portal_url} target="_blank" rel="noreferrer">
                    open
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td style={td}>{la.is_active ? "Yes" : "No"}</td>
              <td style={td}>
                {la.last_reviewed_at
                  ? new Date(la.last_reviewed_at).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={13} style={{ ...td, color: "#666" }}>
                No local authorities match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function ValidateLinks() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);

  async function run() {
    setBusy(true); setMsg(null); setItems([]);
    try {
      const res = await fetch("/api/admin/local-authorities/links/check", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setMsg(`Checked ${j.checked} URLs — ${j.broken} broken`);
      setItems(j.results || []);
    } catch (e: any) {
      setMsg(e?.message || "Failed to check links");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button onClick={run} disabled={busy} style={{ ...btn, background: "#0B66D6", borderColor: "#0B66D6" }}>
        {busy ? "Checking…" : "Validate links"}
      </button>
      {msg && <span style={{ fontSize: 13, opacity: 0.8 }}>{msg}</span>}
      {items.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer" }}>Show results ({items.length})</summary>
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>LA</th>
                  <th style={th}>Kind/Field</th>
                  <th style={th}>Status</th>
                  <th style={th}>Final URL</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>{r.type}</td>
                    <td style={td}>{r.name ?? r.la_id}</td>
                    <td style={td}>{r.type === "la" ? r.field : r.kind}</td>
                    <td style={td}>{r.ok ? r.status : (r.status || "ERR")}</td>
                    <td style={td}>
                      {r.finalUrl ? <a href={r.finalUrl} target="_blank" rel="noreferrer">{r.finalUrl}</a> : r.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #EEE",
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "10px 12px" };
const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

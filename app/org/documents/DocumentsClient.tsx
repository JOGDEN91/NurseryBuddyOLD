"use client";

import { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";

const card: React.CSSProperties = { background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:12 };
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", fontWeight:600, cursor:"pointer" };
const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #4CAF78", background:"#4CAF78", color:"#fff", fontWeight:700, cursor:"pointer" };

type Row = any;

export default function DocumentsClient() {
  const { nurseryId } = useScope();

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!nurseryId) { setRows([]); return; }
    setLoading(true);
    try {
      const url = new URL("/api/documents/list", window.location.origin);
      url.searchParams.set("nursery_id", nurseryId);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.items) ? json.items : []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [nurseryId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return rows;
    return rows.filter((r:any) =>
      (r.child_name ?? "").toLowerCase().includes(t) ||
      (r.parent_email ?? "").toLowerCase().includes(t) ||
      (r.doc_type ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  return (
    <div style={{ display:"grid", gap:12 }}>
      {/* Toolbar (no nursery select) */}
      <div style={{ ...card, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by child/parent/doc type…" style={{ ...input, minWidth:320, flex:1 }} />
        <button onClick={load} style={btn}>Search</button>
      </div>

      <div style={{ ...card, padding:0 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Child</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Doc Type</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Status</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Updated</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding:14, opacity:0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:14, opacity:0.7 }}>No records.</td></tr>
            ) : filtered.map((r:any) => (
              <tr key={r.id} style={{ borderTop:"1px solid #F2F1EE" }}>
                <td style={{ padding:10 }}>{r.child_name ?? "—"}</td>
                <td style={{ padding:10 }}>{r.doc_type ?? "—"}</td>
                <td style={{ padding:10 }}>{r.status ?? "—"}</td>
                <td style={{ padding:10 }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
                <td style={{ padding:10, display:"flex", gap:8 }}>
                  <form action={`/api/documents/request`} method="POST">
                    <input type="hidden" name="document_id" value={r.id}/>
                    <button style={btn}>Request</button>
                  </form>
                  <form action={`/api/documents/approve`} method="POST">
                    <input type="hidden" name="document_id" value={r.id}/>
                    <button style={btnPrimary}>Approve</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

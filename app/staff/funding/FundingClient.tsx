"use client";

import { useEffect, useMemo, useState } from "react";

const card: React.CSSProperties = { background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:12 };
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", fontWeight:600, cursor:"pointer" };
const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #4CAF78", background:"#4CAF78", color:"#fff", fontWeight:700, cursor:"pointer" };

export default function FundingClient({ nurseryId }: { nurseryId: string | null }) {
  const [resolvedNurseryId, setResolvedNurseryId] = useState<string | null>(nurseryId);
  const [termName, setTermName] = useState<string>(""); // blank => current term
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve nursery_id from server when not provided (staff grant)
  useEffect(() => {
    if (nurseryId) { setResolvedNurseryId(nurseryId); return; }
    (async () => {
      const res = await fetch("/api/me/nursery", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setResolvedNurseryId(json?.nursery_id ?? null);
      } else {
        setResolvedNurseryId(null);
      }
    })();
  }, [nurseryId]);

  async function load() {
    if (!resolvedNurseryId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const url = new URL("/api/funding/table", window.location.origin);
      url.searchParams.set("nursery_id", resolvedNurseryId);
      if (termName) url.searchParams.set("term_name", termName);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.items) ? json.items : []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [resolvedNurseryId, termName, includeArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return rows;
    return rows.filter((r) =>
      (r.child_name ?? "").toLowerCase().includes(t) ||
      (r.code ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  return (
    <div style={{ display:"grid", gap:12 }}>
      <div style={{ ...card, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <select value={termName} onChange={(e)=>setTermName(e.target.value)} style={{ ...input, minWidth:180 }}>
          <option value="">Current term</option>
          <option>Autumn 2025</option>
          <option>Summer 2025</option>
          <option>Spring 2025</option>
        </select>
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Search by child name or code"
          style={{ ...input, minWidth:320, flex:1 }}
        />
        <button onClick={load} style={btn}>Search</button>
        <label style={{ display:"inline-flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e)=>setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
        <button style={btn}>Export CSV</button>
        <button style={btnPrimary}>Send forms</button>
      </div>

      <div style={{ ...card, padding:0 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Child</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Status</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Code</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Hours/wk</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Weeks</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Stretch</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:14, opacity:0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:14, opacity:0.7 }}>No records.</td></tr>
            ) : filtered.map((r:any) => (
              <tr key={r.child_id} style={{ borderTop:"1px solid #F2F1EE" }}>
                <td style={{ padding:10 }}>{r.child_name}</td>
                <td style={{ padding:10 }}>{r.status ?? "—"}</td>
                <td style={{ padding:10 }}>{r.code ?? "—"}</td>
                <td style={{ padding:10 }}>{r.hours_per_week ?? "—"}</td>
                <td style={{ padding:10 }}>{r.weeks ?? "—"}</td>
                <td style={{ padding:10 }}>{r.stretch ? "Yes" : "No"}</td>
                <td style={{ padding:10 }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

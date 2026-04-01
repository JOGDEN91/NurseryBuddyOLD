"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const overlay: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:60 };
const modal: React.CSSProperties = { width:"min(960px, 96vw)", maxHeight:"90vh", overflow:"auto", background:"#fff", borderRadius:14, border:"1px solid #E6E4E0", boxShadow:"0 10px 30px rgba(0,0,0,0.12)" };
const header: React.CSSProperties = { padding:"14px 16px", borderBottom:"1px solid #F0EFEC", display:"flex", alignItems:"center", justifyContent:"space-between" };
const body: React.CSSProperties = { padding:16, display:"grid", gap:12 };
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA" };
const row: React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 };
const section: React.CSSProperties = { border:"1px solid #EEE", borderRadius:12, padding:12 };

/**
 * Appears when the URL contains ?child=<uuid>.
 * Reads a full child snapshot from /api/children/full and PATCHes to /api/children/[id].
 */
export default function ChildModal() {
  const search = useSearchParams();
  const router = useRouter();
  const childId = search.get("child");
  const termName = ""; // leave empty -> current term

  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<any>(null);

  const open = !!childId;
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const url = new URL("/api/children/full", window.location.origin);
        url.searchParams.set("child_id", childId!);
        if (termName) url.searchParams.set("term_name", termName);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const j = await res.json();
        setSnap(j);
      } finally { setLoading(false); }
    })();
  }, [open, childId, termName]);

  const [child, setChild] = useState<any>({});
  const [enrol, setEnrol] = useState<any>({});
  const [code, setCode] = useState<any>({});

  useEffect(() => {
    if (!snap) return;
    setChild({
      first_name: snap.child.first_name,
      last_name: snap.child.last_name,
      dob: snap.child.dob,
      start_date: snap.child.start_date,
      end_date: snap.child.end_date,
      parent_name: snap.child.parent_name,
      parent_email: snap.child.parent_email,
      status: snap.child.status,
    });
    setEnrol({
      term_id: snap.term_id ?? null,
      hours_per_week: snap.enrolment?.hours_per_week ?? null,
      weeks: snap.enrolment?.weeks ?? null,
      stretch: snap.enrolment?.stretch ?? false,
      status: snap.enrolment?.status ?? "pending",
    });
    setCode({
      code: snap.code?.code ?? "",
      status: snap.code?.status ?? "pending",
      expiry_date: snap.code?.expiry_date ?? null,
    });
  }, [snap]);

  const documents: Array<{key:string;label:string;status?:string;expires_at?:string|null}> = useMemo(() => {
    if (!snap?.documents) return [];
    return Object.entries(snap.documents).map(([k, v]: any) => ({
      key: k, label: k, status: v.status, expires_at: v.expires_at ?? null,
    }));
  }, [snap]);

  function close() {
    const s = new URLSearchParams(window.location.search);
    s.delete("child");
    router.replace(`${window.location.pathname}${s.size ? `?${s.toString()}` : ""}`);
  }

  async function save() {
    if (!childId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/children/${childId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child,
          enrolment: enrol.term_id ? enrol : undefined,
          code: code.code || code.expiry_date || code.status ? code : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to save");
        return;
      }
      close();
    } finally { setLoading(false); }
  }

  if (!open) return null;

  return (
    <div style={overlay} onClick={close}>
      <div style={modal} onClick={(e)=>e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight:800 }}>Child details</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={close} style={{ ...input, background:"#fff" }}>Cancel</button>
            <button onClick={save} style={{ ...input, background:"#4CAF78", color:"#fff", borderColor:"#4CAF78", fontWeight:700 }}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div style={body}>
          {/* Core */}
          <div style={section}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Child</div>
            <div style={row}>
              <input style={input} placeholder="First name" value={child.first_name || ""} onChange={(e)=>setChild((p:any)=>({...p, first_name:e.target.value}))} />
              <input style={input} placeholder="Last name" value={child.last_name || ""} onChange={(e)=>setChild((p:any)=>({...p, last_name:e.target.value}))} />
              <input style={input} type="date" value={child.dob || ""} onChange={(e)=>setChild((p:any)=>({...p, dob:e.target.value}))} />
              <select style={input} value={child.status || "active"} onChange={(e)=>setChild((p:any)=>({...p, status:e.target.value}))}>
                <option value="onboarding">onboarding</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
              <input style={input} placeholder="Parent name" value={child.parent_name || ""} onChange={(e)=>setChild((p:any)=>({...p, parent_name:e.target.value}))} />
              <input style={input} placeholder="Parent email" value={child.parent_email || ""} onChange={(e)=>setChild((p:any)=>({...p, parent_email:e.target.value}))} />
              <input style={input} type="date" value={child.start_date || ""} onChange={(e)=>setChild((p:any)=>({...p, start_date:e.target.value}))} />
              <input style={input} type="date" value={child.end_date || ""} onChange={(e)=>setChild((p:any)=>({...p, end_date:e.target.value}))} />
            </div>
          </div>

          {/* Funding */}
          <div style={section}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Funding (current term)</div>
            {!enrol.term_id ? (
              <div style={{ opacity:0.75 }}>No current term found for this nursery.</div>
            ) : (
              <div style={row}>
                <input style={input} type="number" placeholder="Hours per week" value={enrol.hours_per_week ?? ""} onChange={(e)=>setEnrol((p:any)=>({...p, hours_per_week: e.target.value ? Number(e.target.value) : null}))} />
                <input style={input} type="number" placeholder="Weeks" value={enrol.weeks ?? ""} onChange={(e)=>setEnrol((p:any)=>({...p, weeks: e.target.value ? Number(e.target.value) : null}))} />
                <label style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <input type="checkbox" checked={!!enrol.stretch} onChange={(e)=>setEnrol((p:any)=>({...p, stretch: e.target.checked }))} />
                  Stretch
                </label>
                <select style={input} value={enrol.status || "pending"} onChange={(e)=>setEnrol((p:any)=>({...p, status:e.target.value}))}>
                  <option value="pending">pending</option>
                  <option value="updated">updated</option>
                  <option value="verified">verified</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            )}
          </div>

          {/* Code */}
          <div style={section}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Funding code</div>
            <div style={row}>
              <input style={input} placeholder="Code" value={code.code || ""} onChange={(e)=>setCode((p:any)=>({...p, code:e.target.value}))} />
              <select style={input} value={code.status || "pending"} onChange={(e)=>setCode((p:any)=>({...p, status:e.target.value}))}>
                <option value="pending">pending</option>
                <option value="submitted">submitted</option>
                <option value="verified">verified</option>
                <option value="expired">expired</option>
                <option value="renewal_due">renewal_due</option>
              </select>
              <input style={input} type="date" value={code.expiry_date || ""} onChange={(e)=>setCode((p:any)=>({...p, expiry_date:e.target.value}))} />
            </div>
          </div>

          {/* Documents */}
          <div style={section}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Documents (latest per type)</div>
            {documents.length === 0 ? (
              <div style={{ opacity:0.7 }}>No documents yet.</div>
            ) : (
              <div style={{ display:"grid", gap:8 }}>
                {documents.map(d => (
                  <div key={d.key} style={{ display:"grid", gridTemplateColumns:"1fr 160px 160px", gap:10 }}>
                    <div>{d.label}</div>
                    <div style={{ fontWeight:600 }}>{d.status ?? "—"}</div>
                    <div>Expires: {d.expires_at ?? "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

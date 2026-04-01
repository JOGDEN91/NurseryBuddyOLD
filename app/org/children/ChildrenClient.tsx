"use client";

import { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";
import ChildEditModal from "./ChildEditModal";

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: "onboarding" | "active" | "archived" | null;
  status_live?: "onboarding" | "active" | "archived" | null;
  parent1_name?: string | null;
  parent1_email?: string | null;
  parent_phone?: string | null; // still a single contact number for now
  town?: string | null;
  postcode?: string | null;
  gender?: "f" | "m" | null;
  ethnicity?: string | null;
  notes?: string | null;
  hours_mon?: number | null;
  hours_tue?: number | null;
  hours_wed?: number | null;
  hours_thu?: number | null;
  hours_fri?: number | null;
};

type Entitlement = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  hours_per_week: number | null;
};

const card: React.CSSProperties = { background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:12 };
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #4CAF78", background:"#4CAF78", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", color:"#24364B", fontWeight:700, cursor:"pointer" };

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  let bg = "#E0E0E0", color = "#24364B";
  if (s === "active") { bg = "#4CAF78"; color = "#fff"; }
  else if (s === "onboarding") { bg = "#FFC107"; color = "#24364B"; }
  else if (s === "archived") { bg = "#E53935"; color = "#fff"; }
  return <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:999, fontSize:12, fontWeight:800, lineHeight:1.6, background:bg, color }}>{status ?? "—"}</span>;
}

function hoursPerWeek(c: ChildRow): number {
  const vals = [c.hours_mon, c.hours_tue, c.hours_wed, c.hours_thu, c.hours_fri].map(v =>
    typeof v === "number" && Number.isFinite(v) ? v : 0
  );
  return vals.reduce((a, b) => a + b, 0);
}

const fmt = (d?: string | null) => d ? (()=>{const [y,m,dd]=d.slice(0,10).split("-"); return `${dd}-${m}-${y}`;})() : "—";
const isPastDate = (ymd?: string | null) => !!ymd && new Date(ymd) < new Date(new Date().toISOString().slice(0,10));
const statusFromDates = (start?: string|null,end?:string|null) => (end && isPastDate(end)) ? "archived" : (!start ? "onboarding" : (new Date(start) > new Date(new Date().toISOString().slice(0,10)) ? "onboarding" : "active"));

export default function ChildrenClient() {
  const { nurseryId } = useScope();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  // Add/Import modal state (unchanged visuals)
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addData, setAddData] = useState<Partial<ChildRow>>({ status: "onboarding" });

  const [impOpen, setImpOpen] = useState(false);
  const [impBusy, setImpBusy] = useState(false);
  const [impErr, setImpErr] = useState<string | null>(null);
  const [impFile, setImpFile] = useState<File | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);

  // Editor state + helpers
  const [editingId, setEditingId] = useState<string | null>(null);
  const openEditor = (id?: string | null) => { if (id) setEditingId(id); };
  const closeEditor = () => setEditingId(null);

  // NEW: entitlements for the edit modal (active only)
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [entsLoaded, setEntsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parameters/entitlements", {
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!cancelled && Array.isArray(j?.entitlements)) {
          setEntitlements(j.entitlements);
        }
      } finally {
        if (!cancelled) setEntsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function load() {
    if (!nurseryId) { setRows([]); return; }
    setLoading(true);
    try {
      const url = new URL("/api/children", window.location.origin);
      url.searchParams.set("nursery_id", nurseryId);
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.children) ? json.children : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [nurseryId, includeArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
      return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(t) ||
      (r.parent1_name ?? "").toLowerCase().includes(t) ||
      (r.parent1_email ?? "").toLowerCase().includes(t) ||
      (r.postcode ?? "").toLowerCase().includes(t) ||
      (r.notes ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  // Add / Import helpers
  function setAdd<K extends keyof ChildRow>(k: K, v: string) { setAddData(d => ({...d,[k]:v})); }

  // phone helpers for Add modal
  const [addPhoneCountry, setAddPhoneCountry] = useState<string>("+44"); // default UK
  function normalizedAddPhone(): string | null {
    const raw = (addData.parent_phone ?? "").trim();
    if (!raw) return null;
    const digits = raw.replace(/[^\d]/g, "");
    const cc = addPhoneCountry.replace(/[^\d+]/g, "");
    // basic normalization: if it already starts with +, keep; else prefix selected country code
    return raw.startsWith("+") ? raw : `${cc}${digits.startsWith("0") ? digits.slice(1) : digits}`;
  }

  async function submitAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!nurseryId) return;
    setAddBusy(true); setAddErr(null);
    try {
      const payload = {
        ...addData,
        parent_phone: normalizedAddPhone() ?? null,
        status: statusFromDates(addData.start_date ?? null, addData.end_date ?? null),
        nursery_id: nurseryId
      };
      const url = new URL("/api/children", window.location.origin); url.searchParams.set("nursery_id", nurseryId);
      const res = await fetch(url.toString(), {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) { const j=await res.json().catch(()=>({})); throw new Error(j?.error || "Could not add child"); }
      setAddOpen(false); setAddData({ status:"onboarding" }); await load();
    } catch (err:any) { setAddErr(err?.message || "Could not add child"); } finally { setAddBusy(false); }
  }

  async function submitImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!nurseryId) return;
    if (!impFile) { setImpErr("Please choose a file."); return; }
    setImpBusy(true); setImpErr(null);
    try {
      const fd = new FormData(); fd.append("file", impFile);
      const url = new URL("/api/children/import", window.location.origin); url.searchParams.set("nursery_id", nurseryId);
      const res = await fetch(url.toString(), { method:"POST", body: fd, cache: "no-store", credentials: "include" });
      if (!res.ok) { const j=await res.json().catch(()=>({})); throw new Error(j?.error || "Import failed"); }
      setImpOpen(false); setImpFile(null); await load();
    } catch (err:any) { setImpErr(err?.message || "Import failed"); } finally { setImpBusy(false); }
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      {/* Toolbar (no nursery dropdown; sidebar controls nursery) */}
      <div style={{ ...card, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <button onClick={() => setAddOpen(true)} style={{ ...btn, display:"inline-flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18, lineHeight:1 }}>＋</span> Add child
        </button>
        <button onClick={() => setImpOpen(true)} style={btnGhost}>Import</button>
        <div style={{ width:8 }} />
        <input
          value={q} onChange={(e)=>setQ(e.target.value)}
          placeholder="Search by name, parent, email, postcode, or notes…"
          style={{ ...input, minWidth:320, flex:1 }}
          onKeyDown={(e)=>{ if (e.key==="Enter") e.preventDefault(); }}
        />
        <label style={{ display:"inline-flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e)=>setIncludeArchived(e.target.checked)} />
          Include archived children
        </label>
      </div>

      {/* Table */}
      <div style={{ ...card, padding:0 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>First Name</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Surname</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>DOB</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Parent Name</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Parent Email</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Attended Hours / Week</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Start Date</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>End Date</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Status</th>
              <th style={{ textAlign:"left", padding:10, borderBottom:"1px solid #EEE" }}>Notes</th>
            </tr>
          </thead>
          {/* Defensive: if a row has inline action buttons, stop their clicks from bubbling */}
          <tbody
            onClickCapture={(e) => {
              const t = e.target as HTMLElement | null;
              if (!t) return;
              if (t.closest("button, [data-row-action]")) {
                e.stopPropagation();
              }
            }}
          >
            {loading ? (
              <tr><td colSpan={10} style={{ padding:14, opacity:0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding:14, opacity:0.7 }}>No children.</td></tr>
            ) : filtered.map(child => {
              const live = child.status_live ?? child.status;
              return (
                <tr
                  key={child.id}
                  onMouseEnter={() => setHoverId(child.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => openEditor(child.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditor(child.id);
                    }
                  }}
                  style={{ borderTop:"1px solid #F2F1EE", cursor:"pointer", transition:"background 120ms ease" }}
                >
                  <td style={{ padding:10 }}>{child.first_name}</td>
                  <td style={{ padding:10 }}>{child.last_name}</td>
                  <td style={{ padding:10 }}>{fmt(child.date_of_birth)}</td>
                  <td style={{ padding:10 }}>{child.parent1_name ?? "—"}</td>
                  <td style={{ padding:10 }}>{child.parent1_email ?? "—"}</td>
                  <td style={{ padding:10 }}>{hoursPerWeek(child)}</td>
                  <td style={{ padding:10 }}>{fmt(child.start_date)}</td>
                  <td style={{ padding:10 }}>{fmt(child.end_date)}</td>
                  <td style={{ padding:10 }}><StatusPill status={live} /></td>
                  <td style={{ padding:10, maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{child.notes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Import modals (visuals preserved; just extra phone inputs) */}
      {/* ADD MODAL */}
      {addOpen && (
        <div onClick={() => !addBusy && setAddOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:60, padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:"min(780px, 96vw)", background:"#fff", border:"1px solid #E6E4E0", borderRadius:12, boxShadow:"0 10px 30px rgba(0,0,0,0.15)", display:"grid", gridTemplateRows:"auto 1fr auto", maxHeight:"92vh" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #EEE", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontWeight:800 }}>Add child</div>
              <button onClick={(e)=>{ e.stopPropagation(); if (!addBusy) setAddOpen(false); }} style={btnGhost}>Close</button>
            </div>
            <form onSubmit={submitAdd} style={{ padding:16, display:"grid", gap:12, overflow:"auto" }}>
              {addErr && <div style={{ background:"#fdecea", color:"#b71c1c", border:"1px solid #f5c6c6", borderRadius:8, padding:10 }}>{addErr}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>First name</div><input required style={input} value={addData.first_name ?? ""} onChange={(e)=>setAdd("first_name", e.target.value)} /></label>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>Last name</div><input required style={input} value={addData.last_name ?? ""} onChange={(e)=>setAdd("last_name", e.target.value)} /></label>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>Date of birth</div><input required type="date" style={input} value={addData.date_of_birth ?? ""} onChange={(e)=>setAdd("date_of_birth", e.target.value)} /></label>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>Status</div>
                  <select style={input} value={(addData.status as any) ?? "onboarding"} onChange={(e)=>setAdd("status", e.target.value)}>
                    <option value="onboarding">onboarding</option><option value="active">active</option><option value="archived">archived</option>
                  </select>
                </label>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>Start date</div><input type="date" style={input} value={addData.start_date ?? ""} onChange={(e)=>setAdd("start_date", e.target.value)} /></label>
                <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>End date</div><input type="date" style={input} value={addData.end_date ?? ""} onChange={(e)=>setAdd("end_date", e.target.value)} /></label>
              </div>
               <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label style={{ display:"grid", gap:6 }}>
                  <div style={{ fontWeight:700 }}>Parent 1 name</div>
                  <input
                    required
                    style={input}
                    value={addData.parent1_name ?? ""}
                    onChange={(e)=>setAdd("parent1_name", e.target.value)}
                  />
                </label>
                <label style={{ display:"grid", gap:6 }}>
                  <div style={{ fontWeight:700 }}>Parent 1 email</div>
                  <input
                    required
                    type="email"
                    style={input}
                    value={addData.parent1_email ?? ""}
                    onChange={(e)=>setAdd("parent1_email", e.target.value)}
                  />
                </label>
              </div>
              {/* New phone row (country code + phone) */}
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", gap:12 }}>
                <label style={{ display:"grid", gap:6 }}>
                  <div style={{ fontWeight:700 }}>Country code</div>
                  <select
                    value={addPhoneCountry}
                    onChange={(e)=>setAddPhoneCountry(e.currentTarget.value)}
                    style={input}
                  >
                    <option value="+44">🇬🇧 +44 (UK)</option>
                    <option value="+353">🇮🇪 +353 (Ireland)</option>
                    <option value="+1">🇺🇸 +1 (US)</option>
                    <option value="+61">🇦🇺 +61 (Australia)</option>
                    <option value="+64">🇳🇿 +64 (NZ)</option>
                    <option value="+49">🇩🇪 +49 (Germany)</option>
                  </select>
                </label>
                <label style={{ display:"grid", gap:6 }}>
                  <div style={{ fontWeight:700 }}>Parent phone</div>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="e.g. 07123 456789"
                    style={input}
                    value={addData.parent_phone ?? ""}
                    onChange={(e)=>setAdd("parent_phone", e.currentTarget.value)}
                  />
                </label>
              </div>

              <label style={{ display:"grid", gap:6 }}><div style={{ fontWeight:700 }}>Notes (internal)</div><textarea rows={3} style={{ ...input, minHeight:84 }} value={addData.notes ?? ""} onChange={(e)=>setAdd("notes", e.target.value)} /></label>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button type="button" onClick={(e)=>{ e.stopPropagation(); if (!addBusy) setAddOpen(false); }} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={addBusy} style={btn}>{addBusy ? "Saving…" : "Add child"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {impOpen && (
        <div onClick={() => !impBusy && setImpOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:60, padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:"min(640px, 96vw)", background:"#fff", border:"1px solid #E6E4E0", borderRadius:12, boxShadow:"0 10px 30px rgba(0,0,0,0.15)" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #EEE", display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontWeight:800 }}>Import children (.csv, .xls, .xlsx)</div>
              <button onClick={(e)=>{ e.stopPropagation(); if (!impBusy) setImpOpen(false); }} style={btnGhost}>Close</button>
            </div>
            <form onSubmit={submitImport} style={{ padding:16, display:"grid", gap:12 }}>
              {impErr && <div style={{ background:"#fdecea", color:"#b71c1c", border:"1px solid #f5c6c6", borderRadius:8, padding:10 }}>{impErr}</div>}
              <input type="file" accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e)=>setImpFile(e.target.files?.[0] ?? null)} />
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button type="button" onClick={(e)=>{ e.stopPropagation(); if (!impBusy) setImpOpen(false); }} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={impBusy} style={btn}>{impBusy ? "Importing…" : "Import file"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL (mounted via editingId) */}
      {editingId && (
        <ChildEditModal
          key={editingId}
          childId={editingId}
          onClose={() => { closeEditor(); load(); }}
          open={true}
          // NEW: pass active entitlements to the modal
          entitlements={entitlements}
          entitlementsLoaded={entsLoaded}
          // Optional hints the modal may use (safe if ignored by your modal)
          defaultPhoneCountry="+44"
          enableParentPhone={true}
        />
      )}
    </div>
  );
}

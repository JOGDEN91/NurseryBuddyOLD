"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------- types ---------- */
type ChildRow = {
  id: string;
  nursery_id?: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: "onboarding" | "active" | "archived" | null;
  status_live?: "onboarding" | "active" | "archived" | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_nis?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  town?: string | null;
  postcode?: string | null;
  gender?: "f" | "m" | null;
  ethnicity?: string | null;
  notes?: string | null;
};

type FundingCode = {
  id?: string;
  child_id: string;
  code: string | null;
  status: "pending" | "renewal_due" | "submitted" | "verified" | "expired";
  expiry_date: string | null;
};

type FundingTerm = {
  id: string;
  nursery_id: string;
  name: string;
  is_current: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

type Enrolment = {
  id?: string;
  child_id: string;
  nursery_id: string;
  term_id: string;
  mon?: number | null; tue?: number | null; wed?: number | null; thu?: number | null; fri?: number | null;
};

/* ---------- supabase client ---------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ---------- styles ---------- */
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 12 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff" };
const btn: React.CSSProperties   = { padding: "8px 12px", borderRadius: 8, border: "1px solid #4CAF78", background: "#4CAF78", color: "#fff", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", color: "#24364B", fontWeight: 700, cursor: "pointer" };

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  let bg = "#E0E0E0", color = "#24364B";
  if (s === "active")      { bg = "#4CAF78"; color = "#fff"; }
  else if (s === "onboarding") { bg = "#FFC107"; color = "#24364B"; }
  else if (s === "archived")   { bg = "#E53935"; color = "#fff"; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, lineHeight: 1.6, background: bg, color }}>
      {status ?? "—"}
    </span>
  );
}

const fmt = (d?: string | null) => (d ? d.slice(0,10).split("-").reverse().join("-") : "—");
function isPastDate(ymd?: string | null) {
  if (!ymd) return false;
  const [y, m, d] = ymd.slice(0,10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const t = new Date(); const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const endUTC = Date.UTC(y, m-1, d);
  return endUTC < todayUTC;
}
function statusFromDates(start_date?: string | null, end_date?: string | null): "onboarding" | "active" | "archived" {
  if (end_date && isPastDate(end_date)) return "archived";
  if (!start_date) return "onboarding";
  const [y,m,d] = start_date.slice(0,10).split("-").map(Number);
  const t = new Date();
  const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const sUTC = Date.UTC(y, (m??1)-1, d??1);
  return sUTC > todayUTC ? "onboarding" : "active";
}

/* ---------- page ---------- */
export default function StaffChildrenPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [child, setChild] = useState<ChildRow | null>(null);

  const [term, setTerm] = useState<FundingTerm | null>(null);
  const [fCode, setFCode] = useState<FundingCode | null>(null);
  const [enrol, setEnrol] = useState<Enrolment | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    try {
      const url = new URL("/api/children", window.location.origin);
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setRows(Array.isArray(j?.children) ? j.children : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadList(); }, [includeArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(t) ||
      (r.parent_name ?? "").toLowerCase().includes(t) ||
      (r.parent_email ?? "").toLowerCase().includes(t) ||
      (r.postcode ?? "").toLowerCase().includes(t) ||
      (r.notes ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  async function openEdit(id: string) {
    setEditOpen(true);
    setEditLoading(true);
    setEditError(null);
    setChild(null); setTerm(null); setFCode(null); setEnrol(null); setNotice(null);

    try {
      const res = await fetch(`/api/children/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Could not load child (${res.status})`);
      }
      const j = await res.json();
      const c: ChildRow = j.child;

      setChild({
        ...c,
        date_of_birth: (c.date_of_birth ?? "").slice(0,10),
        start_date: (c.start_date ?? "").slice(0,10),
        end_date: (c.end_date ?? "").slice(0,10),
      });

      const nId = c.nursery_id;
      if (nId) {
        const { data: t } = await supabase
          .from<FundingTerm>("funding_terms")
          .select("*")
          .eq("nursery_id", nId)
          .eq("is_current", true)
          .maybeSingle();
        if (t) setTerm(t);
      }

      const { data: codes } = await supabase
        .from<FundingCode>("funding_codes")
        .select("*")
        .eq("child_id", id)
        .order("created_at" as any, { ascending: false })
        .limit(1);
      if (codes && codes.length) setFCode(codes[0]);
      else setFCode({ child_id: id, code: "", status: "pending", expiry_date: null });

      if (nId && (term?.id || false)) {
        const { data: en } = await supabase
          .from<Enrolment>("funding_enrolments")
          .select("*")
          .eq("child_id", id)
          .eq("term_id", term!.id)
          .maybeSingle();
        if (en) setEnrol(en);
        else setEnrol({ child_id: id, nursery_id: nId, term_id: term!.id });
      }
    } catch (e: any) {
      setEditError(e?.message || "Failed to load child");
    } finally {
      setEditLoading(false);
    }
  }

  function setChildField<K extends keyof ChildRow>(k: K, v: any) {
    setChild((c) => (c ? { ...c, [k]: v } : c));
  }
  function setFCodeField<K extends keyof FundingCode>(k: K, v: any) {
    setFCode((fc) => (fc ? { ...fc, [k]: v } : fc));
  }
  function setEnrolField<K extends keyof Enrolment>(k: K, v: any) {
    setEnrol((e) => (e ? { ...e, [k]: v } : e));
  }

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!child) return;
    setSaving(true); setNotice(null);
    try {
      const payload = {
        first_name: child.first_name?.trim(),
        last_name: child.last_name?.trim(),
        date_of_birth: child.date_of_birth || null,
        start_date: child.start_date || null,
        end_date: child.end_date || null,
        status: statusFromDates(child.start_date, child.end_date),
        parent_name: child.parent_name?.trim() ?? null,
        parent_email: child.parent_email?.trim() ?? null,
        parent_nis: child.parent_nis ?? null,
        address_line1: child.address_line1 ?? null,
        address_line2: child.address_line2 ?? null,
        town: child.town ?? null,
        postcode: child.postcode ?? null,
        gender: child.gender ?? null,
        ethnicity: child.ethnicity ?? null,
        notes: child.notes ?? null,
      };
      const r = await fetch(`/api/children/${child.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Could not save child");
      }

      if (fCode && fCode.child_id === child.id) {
        const { error: fcErr } = await supabase.from("funding_codes").upsert({
          child_id: child.id,
          code: fCode.code || null,
          status: fCode.status || "pending",
          expiry_date: fCode.expiry_date || null,
        } as any);
        if (fcErr) throw new Error(`Funding code: ${fcErr.message}`);
      }

      if (enrol && enrol.child_id === child.id && term?.id) {
        try {
          const resp = await fetch("/api/funding/enrolments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...enrol, term_id: term.id }),
          });
          if (!resp.ok) setNotice("Enrolments not available yet. Child saved; funding code saved.");
        } catch {
          setNotice("Enrolments not available yet. Child saved; funding code saved.");
        }
      }

      setEditOpen(false);
      await loadList();
    } catch (err: any) {
      alert(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* top bar */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => setAddOpen(true)}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span> Add child
        </button>
        <button style={btnGhost} onClick={() => setImpOpen(true)}>Import</button>
        <div style={{ width: 8 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, parent, email, postcode, or notes…"
          style={{ ...input, minWidth: 320, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived children
        </label>
      </div>

      {/* table */}
      <div style={{ ...card, padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>First Name</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Surname</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>DOB</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Parent Name</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Parent Email</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Start Date</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>End Date</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Status</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 14, opacity: 0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 14, opacity: 0.7 }}>No children.</td></tr>
            ) : filtered.map((r) => {
              const live = r.status_live ?? r.status;
              return (
                <tr key={r.id}
                    onMouseEnter={() => setHoverId(r.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => openEdit(r.id)}
                    style={{ borderTop: "1px solid #F2F1EE", cursor: "pointer", background: hoverId === r.id ? "#FAFCF9" : "transparent", transition: "background 120ms" }}>
                  <td style={{ padding: 10 }}>{r.first_name}</td>
                  <td style={{ padding: 10 }}>{r.last_name}</td>
                  <td style={{ padding: 10 }}>{fmt(r.date_of_birth)}</td>
                  <td style={{ padding: 10 }}>{r.parent_name ?? "—"}</td>
                  <td style={{ padding: 10 }}>{r.parent_email ?? "—"}</td>
                  <td style={{ padding: 10 }}>{fmt(r.start_date)}</td>
                  <td style={{ padding: 10 }}>{fmt(r.end_date)}</td>
                  <td style={{ padding: 10 }}><StatusPill status={live} /></td>
                  <td style={{ padding: 10, maxWidth: 260 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: r.notes ? 1 : 0.6 }}>
                      {r.notes || "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL (same as org) */}
      {editOpen && (
        <div onClick={() => !saving && setEditOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(880px, 96vw)", background: "#fff", border: "1px solid #E6E4E0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: "92vh" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>Child details</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => !saving && setEditOpen(false)} style={btnGhost}>Cancel</button>
                <button onClick={saveAll as any} style={btn} disabled={saving || !!editError}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>

            <form onSubmit={saveAll} style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>
              {editLoading ? <div>Loading…</div> : editError ? (
                <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>{editError}</div>
              ) : child ? (
                <>
                  {/* Child core + labels */}
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Child</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>First name</span>
                        <input style={input} value={child.first_name ?? ""} onChange={(e) => setChildField("first_name", e.target.value)} placeholder="First name" />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Surname</span>
                        <input style={input} value={child.last_name ?? ""} onChange={(e) => setChildField("last_name", e.target.value)} placeholder="Surname" />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>DOB</span>
                        <input type="date" style={input} value={child.date_of_birth ?? ""} onChange={(e) => setChildField("date_of_birth", e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Start date</span>
                        <input type="date" style={input} value={child.start_date ?? ""} onChange={(e) => setChildField("start_date", e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>End date</span>
                        <input type="date" style={input} value={child.end_date ?? ""} onChange={(e) => setChildField("end_date", e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Gender</span>
                        <select style={input} value={child.gender ?? ""} onChange={(e) => setChildField("gender", e.target.value as any)}>
                          <option value="">—</option>
                          <option value="f">Female</option>
                          <option value="m">Male</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Derived status</span>
                        <select style={input} value={statusFromDates(child.start_date, child.end_date)} onChange={() => {}}>
                          <option value="onboarding">onboarding</option>
                          <option value="active">active</option>
                          <option value="archived">archived</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Ethnicity</span>
                        <input style={input} value={child.ethnicity ?? ""} onChange={(e) => setChildField("ethnicity", e.target.value)} placeholder="Ethnicity" />
                      </label>
                    </div>

                    {isPastDate(child.end_date) && (
                      <div style={{ fontSize: 12, color: "#b26a00", marginTop: 8 }}>
                        End date is in the past: this child will be <b>archived</b> on save.
                      </div>
                    )}
                  </div>

                  {/* Address & Parent */}
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Address & Parent</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Parent name</span>
                        <input style={input} value={child.parent_name ?? ""} onChange={(e) => setChildField("parent_name", e.target.value)} placeholder="Parent name" />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Parent email</span>
                        <input type="email" style={input} value={child.parent_email ?? ""} onChange={(e) => setChildField("parent_email", e.target.value)} placeholder="Parent email" />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 12, marginBottom: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Address line 1</span>
                        <input style={input} value={child.address_line1 ?? ""} onChange={(e) => setChildField("address_line1", e.target.value)} placeholder="Address line 1" />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Address line 2</span>
                        <input style={input} value={child.address_line2 ?? ""} onChange={(e) => setChildField("address_line2", e.target.value)} placeholder="Address line 2" />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Town/City</span>
                        <input style={input} value={child.town ?? ""} onChange={(e) => setChildField("town", e.target.value)} placeholder="Town/City" />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Postcode</span>
                        <input style={input} value={child.postcode ?? ""} onChange={(e) => setChildField("postcode", e.target.value)} placeholder="Postcode" />
                      </label>
                    </div>
                  </div>

                  {/* Funding (current term) */}
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Funding (current term)</div>
                    {term ? (
                      <div style={{ fontSize: 14 }}>
                        {term.name} — {fmt(term.starts_on)} to {fmt(term.ends_on)}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>No current term found for this nursery.</div>
                    )}
                  </div>

                  {/* Funding code + NIS */}
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Funding code</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Code</span>
                        <input style={input} placeholder="Code" value={fCode?.code ?? ""} onChange={(e) => setFCodeField("code", e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Status</span>
                        <select style={input} value={fCode?.status ?? "pending"} onChange={(e) => setFCodeField("status", e.target.value as any)}>
                          <option value="pending">pending</option>
                          <option value="renewal_due">renewal_due</option>
                          <option value="submitted">submitted</option>
                          <option value="verified">verified</option>
                          <option value="expired">expired</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Expiry date</span>
                        <input type="date" style={input} value={fCode?.expiry_date ?? ""} onChange={(e) => setFCodeField("expiry_date", e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>NIS</span>
                        <input style={input} value={child.parent_nis ?? ""} onChange={(e) => setChildField("parent_nis", e.target.value)} placeholder="Parent NIS/NIN" />
                      </label>
                    </div>
                  </div>

                  {/* Enrolment */}
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Weekly hours (this term)</div>
                    {term ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                        {(["mon","tue","wed","thu","fri"] as const).map((d) => (
                          <label key={d} style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>{d}</span>
                            <input
                              type="number" min={0} step={0.5}
                              value={(enrol as any)?.[d] ?? ""} placeholder="hrs"
                              onChange={(e) => setEnrolField(d, e.target.value === "" ? null : Number(e.target.value))}
                              style={input}
                            />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>No current term — enrolment entry unavailable.</div>
                    )}
                  </div>

                  {notice && <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", color: "#6D4C41", borderRadius: 8, padding: 10 }}>{notice}</div>}
                </>
              ) : <div />}
            </form>
          </div>
        </div>
      )}

      {/* ADD + IMPORT modals; keep your implementations */}
      {addOpen && <div />}
      {impOpen && <div />}
    </div>
  );
}

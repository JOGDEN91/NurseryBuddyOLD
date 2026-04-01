"use client";

import { useEffect, useMemo, useState } from "react";

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: "onboarding" | "active" | "archived" | null;
  status_live?: "onboarding" | "active" | "archived" | null; // <- from API
  parent_name?: string | null;
  parent_email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  town?: string | null;
  postcode?: string | null;
  gender?: "f" | "m" | null;
  ethnicity?: string | null;
  notes?: string | null;
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 12,
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
};
const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#24364B",
  fontWeight: 700,
  cursor: "pointer",
};

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  let bg = "#E0E0E0";
  let color = "#24364B";
  if (s === "active") { bg = "#4CAF78"; color = "#fff"; }
  else if (s === "onboarding") { bg = "#FFC107"; color = "#24364B"; }
  else if (s === "archived") { bg = "#E53935"; color = "#fff"; }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1.6,
        background: bg,
        color,
      }}
    >
      {status ?? "—"}
    </span>
  );
}

// helper: YYYY-MM-DD -> DD-MM-YYYY
function fmt(d?: string | null) {
  if (!d) return "—";
  const s = d.slice(0, 10);
  const [y, m, dd] = s.split("-");
  if (!y || !m || !dd) return "—";
  return `${dd}-${m}-${y}`;
}

// helper: is the YYYY-MM-DD date strictly before today?
function isPastDate(ymd?: string | null) {
  if (!ymd) return false;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const end = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const tUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return end.getTime() < tUTC.getTime();
}

// Live status from dates (reversible)
function statusFromDates(start_date?: string | null, end_date?: string | null): "onboarding" | "active" | "archived" {
  if (end_date && isPastDate(end_date)) return "archived";
  if (!start_date) return "onboarding";
  const [y, m, d] = start_date.slice(0, 10).split("-").map(Number);
  const sdt = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const tUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return sdt.getTime() > tUTC.getTime() ? "onboarding" : "active";
}

export default function ChildrenPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [hoverId, setHoverId] = useState<string | null>(null);

  // --- Add & Import modals ---
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addData, setAddData] = useState<Partial<ChildRow>>({
    status: "onboarding",
  });

  const [impOpen, setImpOpen] = useState(false);
  const [impBusy, setImpBusy] = useState(false);
  const [impErr, setImpErr] = useState<string | null>(null);
  const [impFile, setImpFile] = useState<File | null>(null);

  // --- Edit modal ---
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editData, setEditData] = useState<ChildRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const url = new URL("/api/children", window.location.origin);
      url.searchParams.set("nursery", "mine");
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const list: ChildRow[] = Array.isArray(json?.children) ? json.children : [];
      setRows(list);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [includeArchived]);

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

  // ---------- Row click => Edit ----------
  async function openEdit(id: string) {
    setEditId(id);
    setEditOpen(true);
    setEditLoading(true);
    setEditError(null);
    setEditData(null);

    try {
      const r = await fetch(`/api/children/${id}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setEditError(j?.error || `Could not load child (${r.status})`);
        return;
      }
      const j = await r.json().catch(() => ({}));
      const c: ChildRow | undefined = j?.child;
      if (!c) { setEditError("Child not found"); return; }

      setEditData({
        id: c.id,
        first_name: c.first_name ?? "",
        last_name: c.last_name ?? "",
        date_of_birth: (c.date_of_birth ?? "").slice(0,10),
        start_date: (c.start_date ?? "").slice(0,10),
        end_date: (c.end_date ?? "").slice(0,10),
        status: (c.status as any) ?? "active",
        parent_name: c.parent_name ?? "",
        parent_email: c.parent_email ?? "",
        address_line1: c.address_line1 ?? "",
        address_line2: c.address_line2 ?? "",
        town: c.town ?? "",
        postcode: c.postcode ?? "",
        gender: (c.gender as any) ?? "",
        ethnicity: c.ethnicity ?? "",
        notes: c.notes ?? "",
      });
    } catch (e: any) {
      setEditError(e?.message || "Failed to load child");
    } finally {
      setEditLoading(false);
    }
  }

  function update<K extends keyof ChildRow>(k: K, v: string) {
    setEditData(d => d ? ({ ...d, [k]: v }) as ChildRow : d);
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editId || !editData) return;

    // LIVE STATUS (reversible)
    const statusFinal = statusFromDates(editData.start_date, editData.end_date);

    const payload = {
      first_name: (editData.first_name ?? "").trim(),
      last_name: (editData.last_name ?? "").trim(),
      date_of_birth: editData.date_of_birth || null,
      start_date: editData.start_date || null,
      end_date: editData.end_date || null,
      status: statusFinal,
      parent_name: (editData.parent_name ?? "").trim(),
      parent_email: (editData.parent_email ?? "").trim(),
      address_line1: editData.address_line1 || null,
      address_line2: editData.address_line2 || null,
      town: editData.town || null,
      postcode: editData.postcode || null,
      gender: editData.gender || null,
      ethnicity: editData.ethnicity || null,
      notes: editData.notes || null,
    };

    const r = await fetch(`/api/children/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || "Could not save");
      return;
    }
    setEditOpen(false);
    setEditId(null);
    setEditData(null);
    await load();
  }

  // ---------- Add child ----------
  function setAdd<K extends keyof ChildRow>(k: K, v: string) {
    setAddData(d => ({ ...d, [k]: v }));
  }

  async function submitAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddBusy(true);
    setAddErr(null);
    try {
      const statusFinal = statusFromDates(addData.start_date ?? null, addData.end_date ?? null);

      const payload = {
        first_name: (addData.first_name ?? "").trim(),
        last_name: (addData.last_name ?? "").trim(),
        parent_name: (addData.parent_name ?? "").trim(),
        parent_email: (addData.parent_email ?? "").trim(),
        date_of_birth: addData.date_of_birth || null,
        start_date: addData.start_date || null,
        end_date: addData.end_date || null,
        status: statusFinal,
        notes: addData.notes ?? null,
        address_line1: addData.address_line1 ?? null,
        address_line2: addData.address_line2 ?? null,
        town: addData.town ?? null,
        postcode: addData.postcode ?? null,
        gender: addData.gender ?? null,
        ethnicity: addData.ethnicity ?? null,
      };
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Could not add child");
      }
      setAddOpen(false);
      setAddData({ status: "onboarding" });
      await load();
    } catch (err: any) {
      setAddErr(err?.message || "Could not add child");
    } finally {
      setAddBusy(false);
    }
  }

  // ---------- Import ----------
  async function submitImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!impFile) { setImpErr("Please choose a file."); return; }
    setImpBusy(true);
    setImpErr(null);
    try {
      const fd = new FormData();
      fd.append("file", impFile);
      const res = await fetch("/api/children/import", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Import failed");
      }
      setImpOpen(false);
      setImpFile(null);
      await load();
    } catch (err: any) {
      setImpErr(err?.message || "Import failed");
    } finally {
      setImpBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Top bar */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setAddOpen(true)} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span> Add child
        </button>
        <button onClick={() => setImpOpen(true)} style={btnGhost}>Import</button>

        <div style={{ width: 8 }} />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, parent, email, postcode, or notes…"
          style={{ ...input, minWidth: 320, flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived children
        </label>
      </div>

      {/* Table */}
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
            ) : filtered.map(r => {
              const hovered = hoverId === r.id;
              const live = r.status_live ?? r.status; // prefer live status from API
              return (
                <tr
                  key={r.id}
                  onMouseEnter={() => setHoverId(r.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => openEdit(r.id)}
                  style={{
                    borderTop: "1px solid #F2F1EE",
                    cursor: "pointer",
                    background: hovered ? "#FAFCF9" : "transparent",
                    transition: "background 120ms ease",
                  }}
                >
                  <td style={{ padding: 10 }}>{r.first_name}</td>
                  <td style={{ padding: 10 }}>{r.last_name}</td>
                  <td style={{ padding: 10 }}>{fmt(r.date_of_birth)}</td>
                  <td style={{ padding: 10 }}>{r.parent_name ?? "—"}</td>
                  <td style={{ padding: 10 }}>{r.parent_email ?? "—"}</td>
                  <td style={{ padding: 10 }}>{fmt(r.start_date)}</td>
                  <td style={{ padding: 10 }}>{fmt(r.end_date)}</td>
                  <td style={{ padding: 10 }}><StatusPill status={live} /></td>
                  <td style={{ padding: 10, maxWidth: 260 }}>
                    <div style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      opacity: r.notes ? 1 : 0.6
                    }}>
                      {r.notes || "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ADD MODAL (with live status hint) */}
      {addOpen && (
        <div
          onClick={() => !addBusy && setAddOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(780px, 96vw)", background: "#fff", border: "1px solid #E6E4E0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: "92vh" }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>Add child</div>
              <button onClick={() => !addBusy && setAddOpen(false)} style={btnGhost}>Close</button>
            </div>

            <form onSubmit={submitAdd} style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>
              {addErr && (
                <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>
                  {addErr}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>First name</div>
                  <input required style={input} value={addData.first_name ?? ""} onChange={(e) => setAdd("first_name", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Last name</div>
                  <input required style={input} value={addData.last_name ?? ""} onChange={(e) => setAdd("last_name", e.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Date of birth</div>
                  <input required type="date" style={input} value={addData.date_of_birth ?? ""} onChange={(e) => setAdd("date_of_birth", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Status</div>
                  {/* status is derived; keep selectable if you want, but the DB/UI will override based on dates */}
                  <select style={input} value={(addData.status as any) ?? "onboarding"} onChange={(e) => setAdd("status", e.target.value)}>
                    <option value="onboarding">onboarding</option>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Start date</div>
                  <input type="date" style={input} value={addData.start_date ?? ""} onChange={(e) => setAdd("start_date", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>End date</div>
                  <input type="date" style={input} value={addData.end_date ?? ""} onChange={(e) => setAdd("end_date", e.target.value)} />
                  {isPastDate(addData.end_date) && (
                    <div style={{ fontSize: 12, color: "#b26a00", marginTop: 4 }}>
                      End date is in the past: this child will be <b>archived</b> on save.
                    </div>
                  )}
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Parent name</div>
                  <input required style={input} value={addData.parent_name ?? ""} onChange={(e) => setAdd("parent_name", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Parent email</div>
                  <input required type="email" style={input} value={addData.parent_email ?? ""} onChange={(e) => setAdd("parent_email", e.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Town/City</div>
                  <input style={input} value={addData.town ?? ""} onChange={(e) => setAdd("town", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Postcode</div>
                  <input style={input} value={addData.postcode ?? ""} onChange={(e) => setAdd("postcode", e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Gender</div>
                  <select style={input} value={(addData.gender as any) ?? ""} onChange={(e) => setAdd("gender", e.target.value)}>
                    <option value="">—</option>
                    <option value="f">Female</option>
                    <option value="m">Male</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Ethnicity</div>
                <input style={input} value={addData.ethnicity ?? ""} onChange={(e) => setAdd("ethnicity", e.target.value)} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Notes (internal)</div>
                <textarea rows={3} style={{ ...input, minHeight: 84 }} value={addData.notes ?? ""} onChange={(e) => setAdd("notes", e.target.value)} />
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => !addBusy && setAddOpen(false)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={addBusy} style={btn}>
                  {addBusy ? "Saving…" : "Add child"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {impOpen && (
        <div
          onClick={() => !impBusy && setImpOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(640px, 96vw)", background: "#fff", border: "1px solid #E6E4E0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>Import children (.csv, .xls, .xlsx)</div>
              <button onClick={() => !impBusy && setImpOpen(false)} style={btnGhost}>Close</button>
            </div>

            <form onSubmit={submitImport} style={{ padding: 16, display: "grid", gap: 12 }}>
              {impErr && (
                <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>
                  {impErr}
                </div>
              )}

              <input
                type="file"
                accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setImpFile(e.target.files?.[0] ?? null)}
              />

              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Expected headers (case-insensitive): first_name, last_name, date_of_birth (YYYY-MM-DD),
                parent_name, parent_email, start_date, end_date, status, notes, town, postcode, gender, ethnicity.
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => !impBusy && setImpOpen(false)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={impBusy} style={btn}>
                  {impBusy ? "Importing…" : "Import file"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL (with live status hint) */}
      {editOpen && (
        <div
          onClick={() => setEditOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(780px, 96vw)", background: "#fff", border: "1px solid #E6E4E0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: "92vh" }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>Edit child</div>
              <button onClick={() => setEditOpen(false)} style={btnGhost}>Close</button>
            </div>

            <form onSubmit={saveEdit} style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>
              {editLoading ? (
                <div>Loading…</div>
              ) : editError ? (
                <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>
                  {editError}
                </div>
              ) : !editData ? (
                <div style={{ opacity: 0.8 }}>No data</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>First name</div>
                      <input required style={input} value={editData.first_name ?? ""} onChange={(e) => update("first_name", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Last name</div>
                      <input required style={input} value={editData.last_name ?? ""} onChange={(e) => update("last_name", e.target.value)} />
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Date of birth</div>
                      <input type="date" required style={input} value={editData.date_of_birth ?? ""} onChange={(e) => update("date_of_birth", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Status</div>
                      <select style={input} value={statusFromDates(editData.start_date, editData.end_date)} onChange={() => { /* status is derived; ignore manual change */ }}>
                        <option value="onboarding">onboarding</option>
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Start date</div>
                      <input type="date" style={input} value={editData.start_date ?? ""} onChange={(e) => update("start_date", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>End date</div>
                      <input type="date" style={input} value={editData.end_date ?? ""} onChange={(e) => update("end_date", e.target.value)} />
                      {isPastDate(editData.end_date) && (
                        <div style={{ fontSize: 12, color: "#b26a00", marginTop: 4 }}>
                          End date is in the past: this child will be <b>archived</b> on save.
                        </div>
                      )}
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Parent name</div>
                      <input required style={input} value={editData.parent_name ?? ""} onChange={(e) => update("parent_name", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Parent email</div>
                      <input required type="email" style={input} value={editData.parent_email ?? ""} onChange={(e) => update("parent_email", e.target.value)} />
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Town/City</div>
                      <input style={input} value={editData.town ?? ""} onChange={(e) => update("town", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Postcode</div>
                      <input style={input} value={editData.postcode ?? ""} onChange={(e) => update("postcode", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 700 }}>Gender</div>
                      <select style={input} value={editData.gender ?? ""} onChange={(e) => update("gender", e.target.value)}>
                        <option value="">—</option>
                        <option value="f">Female</option>
                        <option value="m">Male</option>
                      </select>
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>Ethnicity</div>
                    <input style={input} value={editData.ethnicity ?? ""} onChange={(e) => update("ethnicity", e.target.value)} />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>Notes (internal)</div>
                    <textarea rows={3} style={{ ...input, minHeight: 84 }} value={editData.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
                  </label>
                </>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setEditOpen(false)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={editLoading || !editData || !!editError} style={btn}>
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
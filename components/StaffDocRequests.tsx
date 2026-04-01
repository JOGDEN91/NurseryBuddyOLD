"use client";

import { useEffect, useMemo, useState } from "react";

type Child = { id: string; child_name: string; date_of_birth: string };
type DocType = { id: string; label: string };
type LinkedFile = {
  id: string;
  label: string | null;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
  signed_url: string | null;
};
type DocReq = {
  id: string;
  child_id: string;
  doc_type_id: string;
  status: "pending" | "submitted" | "approved" | "rejected";
  linked_file_id: string | null;
  linked_file?: LinkedFile | null; // NEW
  notes: string | null;
  app_document_types: { id: string; label: string };
  created_at?: string;
};

const STATUSES: DocReq["status"][] = ["pending", "submitted", "approved", "rejected"];

export default function StaffDocRequests() {
  const [children, setChildren] = useState<Child[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [items, setItems] = useState<DocReq[]>([]);

  const [childId, setChildId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [notes, setNotes] = useState("");

  const [fChild, setFChild] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "child">("newest");

  const childMap = useMemo(() => new Map(children.map(c => [c.id, c])), [children]);
  const typeMap = useMemo(() => new Map(types.map(t => [t.id, t.label])), [types]);

  async function load() {
    const [c, t, r] = await Promise.all([
      fetch("/api/children").then((r) => r.json()),
      fetch("/api/doc-types").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("/api/doc-requests").then((r) => r.json()),
    ]);
    setChildren(c.items || []);
    setTypes(t.items || []);
    setItems(r.items || []);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let rows = items.slice();
    if (fChild) rows = rows.filter((x) => x.child_id === fChild);
    if (fStatus) rows = rows.filter((x) => x.status === fStatus);
    if (fType) rows = rows.filter((x) => x.doc_type_id === fType);

    if (sortBy === "child") {
      rows.sort((a, b) => {
        const an = childMap.get(a.child_id)?.child_name || "";
        const bn = childMap.get(b.child_id)?.child_name || "";
        return an.localeCompare(bn);
      });
    } else {
      rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }
    return rows;
  }, [items, fChild, fStatus, fType, sortBy, childMap]);

  async function createReq() {
    if (!childId || !typeId) return;
    const res = await fetch("/api/doc-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child_id: childId, doc_type_id: typeId, notes }),
    });
    const body = await res.json();
    if (!res.ok) return alert(body?.error || "Create failed");
    setNotes(""); setTypeId(""); setChildId("");
    load();
  }

  async function patch(id: string, patch: Partial<DocReq>) {
    const res = await fetch(`/api/doc-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) return alert(body?.error || "Update failed");
    load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/doc-requests/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body?.error || "Delete failed");
    load();
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
      <h3 style={{ marginTop: 0 }}>Requested documents (staff)</h3>

      {/* Create form */}
      <div style={{ display: "grid", gap: 8, border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">Select child…</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.child_name} (DOB {c.date_of_birth})
              </option>
            ))}
          </select>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select document…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button onClick={createReq}>Request</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={fChild} onChange={(e) => setFChild(e.target.value)}>
          <option value="">All children</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.child_name}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="newest">Sort: Newest</option>
          <option value="child">Sort: Child name</option>
        </select>
        {(fChild || fType || fStatus) && (
          <button onClick={() => { setFChild(""); setFType(""); setFStatus(""); setSortBy("newest"); }}>
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {filtered.map((r) => {
          const child = childMap.get(r.child_id);
          const typeLabel = r.app_document_types?.label || typeMap.get(r.doc_type_id) || "Document";
          return (
            <li key={r.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div><b>{typeLabel}</b></div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {child ? <>Child: <b>{child.child_name}</b> (DOB {child.date_of_birth})</> : "Child: —"}
                    {" · "}Status: <b>{r.status}</b>
                    {r.linked_file ? " · file attached" : ""}
                  </div>
                  {r.notes && <div style={{ fontSize: 12, opacity: 0.8 }}>Notes: {r.notes}</div>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {r.linked_file?.signed_url && (
                    <a href={r.linked_file.signed_url} target="_blank" rel="noreferrer">View file</a>
                  )}
                  {r.status !== "approved" && <button onClick={() => patch(r.id, { status: "approved" })}>Approve</button>}
                  {r.status !== "rejected" && <button onClick={() => patch(r.id, { status: "rejected" })}>Reject</button>}
                  {r.status !== "pending" && (
                    <button onClick={() => patch(r.id, { status: "pending", linked_file_id: r.linked_file_id })}>
                      Reset
                    </button>
                  )}
                  <button onClick={() => remove(r.id)}>Delete</button>
                </div>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && <li style={{ opacity: 0.7 }}>No requests found.</li>}
      </ul>
    </section>
  );
}
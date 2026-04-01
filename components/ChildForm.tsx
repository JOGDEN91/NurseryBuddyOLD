"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  child_name: string;
  date_of_birth: string; // YYYY-MM-DD
  council_code: string;
  status: "submitted" | "approved" | "rejected";
  code_expires_at: string | null; // YYYY-MM-DD
  notes: string | null;
};

export default function ChildForm() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form state for a new record
  const [childName, setChildName] = useState("");
  const [dob, setDob] = useState("");
  const [code, setCode] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/children");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load");
      setRows(body.items || []);
    } catch (e: any) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submitNew() {
    if (!childName.trim() || !dob || !code.trim()) return;
    const res = await fetch("/api/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name: childName,
        date_of_birth: dob,
        council_code: code,
      }),
    });
    const body = await res.json();
    if (!res.ok) return alert(body?.error || "Submit failed");
    setChildName(""); setDob(""); setCode("");
    load();
  }

  async function updateBasics(id: string, patch: Partial<Row>) {
    const res = await fetch(`/api/children/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) return alert(body?.error || "Update failed");
    load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/children/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body?.error || "Delete failed");
    load();
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3 style={{ marginTop: 0 }}>Child details & council code</h3>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>
            <div>Child name</div>
            <input value={childName} onChange={(e)=>setChildName(e.target.value)} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
          </label>
          <label>
            <div>Date of birth</div>
            <input type="date" value={dob} onChange={(e)=>setDob(e.target.value)} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
          </label>
          <label>
            <div>Council code</div>
            <input value={code} onChange={(e)=>setCode(e.target.value)} style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }} />
          </label>
        </div>
        <div>
          <button onClick={submitNew} style={{ padding: "8px 12px", borderRadius: 8, background: "black", color: "white" }}>
            Submit
          </button>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "red" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <li key={r.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div><b>{r.child_name}</b> — {r.date_of_birth}</div>
            <div>Council code: <code>{r.council_code}</code></div>
            <div>Status: <b>{r.status}</b>{r.code_expires_at ? ` · Expires: ${r.code_expires_at}` : ""}</div>
            {r.notes && <div style={{ opacity: 0.8 }}>Notes: {r.notes}</div>}

            {/* Parent can edit basic fields; staff-only fields are blocked by RLS */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => {
                const v = prompt("New child name:", r.child_name);
                if (v !== null) updateBasics(r.id, { child_name: v });
              }}>Edit name</button>
              <button onClick={() => {
                const v = prompt("New council code:", r.council_code);
                if (v !== null) updateBasics(r.id, { council_code: v });
              }}>Edit code</button>
              <button onClick={() => {
                const v = prompt("New date of birth (YYYY-MM-DD):", r.date_of_birth);
                if (v !== null) updateBasics(r.id, { date_of_birth: v });
              }}>Edit DOB</button>
              <button onClick={() => remove(r.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
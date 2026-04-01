"use client";

import { useEffect, useState } from "react";
import FileUpload from "@/components/FileUpload";

type LinkedFile = {
  id: string;
  label: string | null;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
  signed_url: string | null; // 1-hour link
};

type DocReq = {
  id: string;
  child_id: string;
  status: "pending" | "submitted" | "approved" | "rejected";
  linked_file_id: string | null;
  linked_file?: LinkedFile | null; // NEW
  notes: string | null;
  app_document_types: { id: string; label: string };
};

export default function ParentChecklist() {
  const [items, setItems] = useState<DocReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); // request id for inline upload

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/doc-requests");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load");
      setItems(body.items || []);
    } catch (e: any) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function linkAndSubmit(reqId: string, fileId: string) {
    const res = await fetch(`/api/doc-requests/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linked_file_id: fileId, status: "submitted" }),
    });
    const body = await res.json();
    if (!res.ok) return alert(body?.error || "Update failed");
    setActive(null);
    load();
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
      <h3 style={{ marginTop: 0 }}>Requested documents</h3>
      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "red" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {items.map((r) => (
          <li key={r.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div><b>{r.app_document_types?.label || "Document"}</b></div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Status: <b>{r.status}</b>
                  {r.linked_file ? " · file attached" : ""}
                </div>
                {r.notes && <div style={{ fontSize: 12, opacity: 0.8 }}>Notes: {r.notes}</div>}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* NEW: view link when a file is attached */}
                {r.linked_file?.signed_url && (
                  <a href={r.linked_file.signed_url} target="_blank" rel="noreferrer">View file</a>
                )}
                {r.status === "pending" && (
                  <button onClick={() => setActive(r.id)} style={{ padding: "6px 10px", borderRadius: 6 }}>
                    Attach
                  </button>
                )}
              </div>
            </div>

            {active === r.id && (
              <div style={{ marginTop: 12 }}>
                <FileUpload
                  defaultChildId={r.child_id}
                  defaultDocType={r.app_document_types?.label}
                  onUploaded={(file) => linkAndSubmit(r.id, file.id)}
                />
              </div>
            )}
          </li>
        ))}

        {items.length === 0 && !loading && <li style={{ opacity: 0.7 }}>No requested documents.</li>}
      </ul>
    </section>
  );
}
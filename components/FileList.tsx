"use client";
import { useEffect, useState } from "react";

type FileRow = {
  id: string;
  label: string;
  path: string;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
  child_name?: string | null;
};

export default function FileList({
  allowDelete = false,
  compactEmpty = false,  // keep: compact empty state
}: {
  allowDelete?: boolean;
  compactEmpty?: boolean;
}) {
  const [items, setItems] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files", {
        cache: "no-store",
        credentials: "include", // <<< IMPORTANT: send cookies
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load files");
      setItems(body.items || []);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  if (!items.length) {
    if (compactEmpty) {
      return <div style={{ fontSize: 14, opacity: 0.75 }}>No documents yet.</div>;
    }
    return (
      <div
        style={{
          border: "1px dashed #e5e7eb",
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
          background: "#fafafa",
        }}
      >
        No documents yet.
      </div>
    );
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {items.map((f) => (
        <li key={f.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{f.label}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {(f.child_name ? `Child: ${f.child_name} — ` : "")}
                {f.mime_type || "file"}
              </div>
            </div>
            {allowDelete && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch(`/api/files/${f.id}`, {
                    method: "DELETE",
                    credentials: "include", // <<< send cookies
                  });
                  if (!res.ok) {
                    const b = await res.json().catch(() => ({}));
                    return alert(b?.error || "Delete failed");
                  }
                  load();
                }}
              >
                <button style={{ borderRadius: 6, padding: "6px 10px" }}>Delete</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

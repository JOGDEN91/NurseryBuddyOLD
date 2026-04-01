"use client";
import { useEffect, useState } from "react";

type ChildRow = {
  id: string;
  child_name: string;
  date_of_birth: string;
  // ... other fields
};

export default function ChildrenAdminList({
  compactEmpty = false, // NEW
}: {
  compactEmpty?: boolean;
}) {
  const [items, setItems] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/children?nursery=1"); // or whatever endpoint you use
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load children");
      setItems(body.items || []);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!items.length) {
    return compactEmpty ? (
      <div style={{ fontSize: 14, opacity: 0.75 }}>No children yet.</div>
    ) : (
      <div
        style={{
          border: "1px dashed #e5e7eb",
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
          background: "#fafafa",
        }}
      >
        No children yet.
      </div>
    );
  }

  // render your table/list for children here
  return (
    <div>
      {/* your existing table/list */}
      {items.length} children
    </div>
  );
}
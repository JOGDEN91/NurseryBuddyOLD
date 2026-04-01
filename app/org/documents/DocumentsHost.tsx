"use client";

import { useState } from "react";

type Opt = { id: string; name: string };

/** Optional iframe host. Prefer DocumentsClient for native UI. */
export default function DocumentsHost({
  nurseries,
  initialNurseryId,
}: {
  nurseries: Opt[];
  initialNurseryId: string;
}) {
  const [nurseryId, setNurseryId] = useState(initialNurseryId);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 12, display:"flex", gap:12, alignItems:"center" }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Nursery</span>
        <select
          value={nurseryId}
          onChange={(e) => setNurseryId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", minWidth: 240 }}
        >
          {nurseries.length === 0 ? (
            <option value="">No nurseries</option>
          ) : (
            nurseries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)
          )}
        </select>
      </div>

      <iframe
        key={nurseryId}
        src={`/staff/documents?nursery_id=${nurseryId}`}
        style={{ width: "100%", height: "75vh", border: "1px solid #E6E4E0", borderRadius: 10, background: "#fff" }}
      />
    </div>
  );
}

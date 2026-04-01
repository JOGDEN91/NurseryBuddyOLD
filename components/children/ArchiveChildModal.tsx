"use client";
import { useState } from "react";

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
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#333",
  fontWeight: 600,
  cursor: "pointer",
};

export default function ArchiveChildModal({
  open,
  childIds,
  onClose,
  onDone,
}: {
  open: boolean;
  childIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [when, setWhen] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  if (!open) return null;

  async function submit() {
    for (const id of childIds) {
      await fetch(`/api/children/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_date: when || null, reason }),
      });
    }
    onDone();
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          background: "#fff",
          border: "1px solid #E6E4E0",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>Archive {childIds.length} {childIds.length === 1 ? "child" : "children"}</div>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Archiving moves the child(ren) to an inactive state. Funding rows remain for reporting; you can restore later.
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label><b>Last day at nursery (optional)</b></label>
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={input} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label><b>Reason (optional)</b></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={submit} style={btn}>Archive</button>
          </div>
        </div>
      </div>
    </div>
  );
}
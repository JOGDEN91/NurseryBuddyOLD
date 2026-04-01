"use client";

import { useScope } from "@/components/scope/ScopeProvider";

const label = { fontSize: 12, opacity: 0.8, color: "rgba(255,255,255,0.85)" };

export default function ScopeSwitcher({
  nurseries,
}: {
  nurseries: { id: string; name: string }[];
}) {
  const { mode, setMode, nurseryId, setNurseryId } = useScope();

  const chip = (active: boolean) => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.25)",
    background: active ? "#24B47E" : "transparent", // staff green
    color: active ? "#fff" : "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties);

  return (
    <div style={{ padding: 12, borderBottom: "1px solid #0f2638" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={label}>Mode</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setMode("org")} style={chip(mode === "org")}>
            Organisation
          </button>
          <button type="button" onClick={() => setMode("nursery")} style={chip(mode === "nursery")}>
            Nursery
          </button>
        </div>
      </div>

      {mode === "nursery" && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={label}>Nursery</span>
          <select
            value={nurseryId ?? ""}
            onChange={(e) => setNurseryId(e.target.value || null)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              minWidth: 175,
              appearance: "none",
            }}
          >
            {nurseries.map((n) => (
              <option key={n.id} value={n.id} style={{ color: "#000" }}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

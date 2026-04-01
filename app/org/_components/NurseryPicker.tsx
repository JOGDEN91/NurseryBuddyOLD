"use client";

type Opt = { id: string; name: string };
export default function NurseryPicker({
  options,
  value,
  onChange,
  label = "Nursery",
}: {
  options: Opt[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label style={{ display: "inline-grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #DADADA",
          background: "#fff",
          minWidth: 240,
        }}
      >
        {options.length === 0 ? (
          <option value="">No nurseries</option>
        ) : (
          options.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))
        )}
      </select>
    </label>
  );
}

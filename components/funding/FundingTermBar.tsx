"use client";

import React, { useEffect, useRef, useState } from "react";

type Term = { id: string; name: string; is_current?: boolean | null };

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
  minWidth: 220,
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#333",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function FundingTermBar({
  onChanged,
}: {
  /** called after a term is created so the parent can refresh */
  onChanged?: () => void;
}) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    const r = await fetch("/api/funding/terms", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setTerms(Array.isArray(j?.terms) ? j.terms : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreateTerm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // capture values from the form via a ref (avoid pooled event issues)
    const fd = new FormData(formRef.current!);
    const payload = {
      name: (fd.get("name") as string)?.trim(),
      start_date: fd.get("start_date") as string, // YYYY-MM-DD
      end_date: fd.get("end_date") as string,
      default_weeks: Number(fd.get("default_weeks") ?? 38) || 38,
      set_current: !!fd.get("set_current"),
      set_next: !!fd.get("set_next"),
    };

    try {
      const res = await fetch("/api/funding/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(j?.error || "Could not create term");
        return;
      }

      // reset safely using ref (no pooled event)
      formRef.current?.reset();
      setOpenAdd(false);

      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {/* Example readout; render your own controls around this */}
      <div style={{ fontWeight: 700 }}>Terms:</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {terms.map(t => (
          <span key={t.id} style={{ padding: "6px 10px", border: "1px solid #E6E4E0", borderRadius: 999 }}>
            {t.name}{t.is_current ? " (current)" : ""}
          </span>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <button style={btn} onClick={() => setOpenAdd(true)}>Create term</button>

      {/* Modal */}
      {openAdd && (
        <div
          onClick={() => setOpenAdd(false)}
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
              width: "min(560px, 96vw)",
              background: "#fff",
              border: "1px solid #E6E4E0",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              maxHeight: "92vh",
            }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>Create funding term</div>
              <button onClick={() => setOpenAdd(false)} style={btnGhost}>Close</button>
            </div>

            <form ref={formRef} onSubmit={onCreateTerm} style={{ padding: 16, display: "grid", gap: 10 }}>
              {error ? (
                <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>
                  {error}
                </div>
              ) : null}

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Name</div>
                <input name="name" placeholder="e.g., Autumn 2025" required style={input} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Start date</div>
                  <input name="start_date" type="date" required style={input} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>End date</div>
                  <input name="end_date" type="date" required style={input} />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Default weeks</div>
                <input name="default_weeks" type="number" min={1} max={52} defaultValue={38} style={input} />
              </label>

              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name="set_current" /> Set as current
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name="set_next" /> Set as next
                </label>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => setOpenAdd(false)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={saving} style={btn}>
                  {saving ? "Saving…" : "Save term"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
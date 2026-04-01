"use client";

import React, { useMemo, useState } from "react";

/* ---------- Types (minimal; matches your table) ---------- */
type Ent = {
  id?: string;
  name: string;
  code: string | null;
  description: string | null;
  hours_per_week: number | null;
  weeks_per_year: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  requires_working_parent: boolean | null;
  means_tested: boolean | null;
  is_active: boolean | null;
};

type Basis = "UNIVERSAL" | "DISADVANTAGED" | "WORKING_PARENT" | "OTHER";

/* ---------- Helpers ---------- */
const labelSm: React.CSSProperties = { fontSize: 12, fontWeight: 700, marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #DADADA",
  borderRadius: 8,
  background: "#fff",
};
const small: React.CSSProperties = { fontSize: 12, color: "#6C7A89" };

const issuerFor = (b: Basis) =>
  b === "WORKING_PARENT" ? "HMRC" : b === "DISADVANTAGED" ? "Local authority" : b === "UNIVERSAL" ? "Local authority" : "—";
const proofFor = (b: Basis) =>
  b === "WORKING_PARENT"
    ? "11-digit HMRC code; reconfirm every 3 months"
    : b === "DISADVANTAGED"
    ? "Income/benefit/SEND evidence (LA checks)"
    : b === "UNIVERSAL"
    ? "None"
    : "—";

function getBasis(r: Ent): Basis {
  if (r.hours_per_week !== 15) return "OTHER";
  if (r.requires_working_parent) return "WORKING_PARENT";
  if (r.means_tested) return "DISADVANTAGED";
  return "UNIVERSAL";
}

function codeSuggest(b: Basis, min: number | null, max: number | null) {
  const band = (() => {
    const toMM = (m: number | null) => (m == null ? "" : `${m}`);
    if (b === "UNIVERSAL") return "U15_3_4";
    if (b === "DISADVANTAGED") return "MT15_2";
    // WP bands: WP15_9_23 / WP15_24_35 / WP15_36_59
    return `WP15_${toMM(min)}_${toMM((max ?? 59))}`;
  })();
  return band;
}

/* ---------- Style ---------- */
const bar: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #EEE",
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};
const searchInput: React.CSSProperties = { ...input, flex: 1, minWidth: 280 };
const primaryBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#24364B",
  fontWeight: 700,
  cursor: "pointer",
};
const tableWrap: React.CSSProperties = { overflowX: "auto" };
const tableCss: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const thCss: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #EEE", fontWeight: 700, background: "#FAFAFA" };
const tdCss: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const noteBar: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #EEE",
  fontSize: 13,
  color: "#434C56",
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};
const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #E6E4E0",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  background: "#FAFAFA",
};
const saveBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #0B66D6",
  background: "#0B66D6",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const errBox: React.CSSProperties = {
  padding: 8,
  border: "1px solid #e5a7a7",
  background: "#fff5f5",
  borderRadius: 8,
  margin: 8,
  color: "#7a2d2d",
  fontSize: 13,
};

/* ---------- Component ---------- */
export default function EntitlementsClient({
  entitlements,
  serverError,
}: {
  entitlements: Ent[];
  serverError?: string | null;
}) {
  const [rows, setRows] = useState<Ent[]>(entitlements);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | "NEW" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && r.is_active === false) return false;
      if (!t) return true;
      return [r.name, r.code ?? "", r.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(t);
    });
  }, [rows, q, showInactive]);

  /* Group into our three 15h block types and "other" */
  const groups = useMemo(() => {
    const base = {
      UNIVERSAL: [] as Ent[],
      DISADVANTAGED: [] as Ent[],
      WORKING_PARENT: [] as Ent[],
      OTHER: [] as Ent[],
    };
    for (const r of filtered) base[getBasis(r)].push(r);
    (Object.keys(base) as Basis[]).forEach((k) =>
      (base as any)[k].sort(
        (a: Ent, b: Ent) => (a.min_age_months ?? 0) - (b.min_age_months ?? 0)
      )
    );
    return base;
  }, [filtered]);

  /* ---------- CRUD helpers ---------- */
  function updateLocal(next: Ent) {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }

  function addPreset(basis: Basis, min: number | null, max: number | null, name?: string) {
    const base: Ent = {
      name:
        name ??
        (basis === "UNIVERSAL"
          ? "Universal 15 (Age 3–4)"
          : basis === "DISADVANTAGED"
          ? "Disadvantaged 15 (Age 2)"
          : "Working Parent 15 (Age band)"),
      code: codeSuggest(basis, min, max),
      description:
        basis === "UNIVERSAL"
          ? "Universal 15 hours per week for ages 3–4."
          : basis === "DISADVANTAGED"
          ? "15 hours/week for eligible 2-year-olds (means-tested)."
          : "Working Parent 15 hours band.",
      hours_per_week: 15,
      weeks_per_year: 38,
      min_age_months: min,
      max_age_months: max,
      requires_working_parent: basis === "WORKING_PARENT",
      means_tested: basis === "DISADVANTAGED",
      is_active: true,
    };
    setRows((prev) => [base, ...prev]);
  }

  function seedStandardBands() {
    // Universal 15: 36–59m
    ensureBand("UNIVERSAL", 36, 59, "Universal 15 (Age 3–4)");
    // Disadvantaged 15: 24–35m
    ensureBand("DISADVANTAGED", 24, 35, "Disadvantaged 15 (Age 2)");
    // Working Parent 15: 9–23m, 24–35m, 36–59m
    ensureBand("WORKING_PARENT", 9, 23, "Working Parent 15 (9–23m)");
    ensureBand("WORKING_PARENT", 24, 35, "Working Parent 15 (24–35m)");
    ensureBand("WORKING_PARENT", 36, 59, "Working Parent 15 (3–4 top-up)");
  }

  function ensureBand(basis: Basis, min: number, max: number, name: string) {
    const exists = rows.some(
      (r) =>
        getBasis(r) === basis &&
        r.min_age_months === min &&
        (r.max_age_months ?? 59) === max &&
        r.hours_per_week === 15
    );
    if (!exists) addPreset(basis, min, max, name);
  }

  async function saveRow(row: Ent) {
    setMsg(null);
    setBusyId(row.id ?? "NEW");

    // Enforce 15h and basis flags on save to avoid drift
    const basis = getBasis({ ...row, hours_per_week: 15 });
    const normalized: Ent = {
      ...row,
      hours_per_week: 15,
      requires_working_parent: basis === "WORKING_PARENT",
      means_tested: basis === "DISADVANTAGED",
      code: (row.code ?? "").toUpperCase(),
      description: row.description ?? "",
      is_active: row.is_active ?? true,
    };

    try {
      const res = await fetch("/api/admin/entitlements", {
        method: row.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(row.id ? { id: row.id, ...normalized } : normalized),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      if (!row.id && j?.id) {
        normalized.id = j.id;
      }
      updateLocal(normalized);
      setMsg("Saved");
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {serverError && <div style={errBox}>{serverError}</div>}

      {/* Toolbar */}
      <div style={bar}>
        <input
          placeholder="Search by name, code, or description…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={searchInput}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.currentTarget.checked)}
          />
          Show inactive
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={seedStandardBands} style={primaryBtn}>
          Seed standard bands
        </button>
        <button type="button" onClick={() => setShowAdvanced((s) => !s)} style={ghostBtn}>
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </button>
        {msg && (
          <span style={{ fontSize: 13, alignSelf: "center", opacity: 0.85, marginLeft: 6 }}>
            {msg}
          </span>
        )}
      </div>

      {/* Policy hints */}
      <div style={noteBar}>
        <span style={badge}>Atomic unit: 15 hours/week</span>
        <span style={badge}>Cap: 30 hours/week</span>
        <span style={badge}>Universal applies automatically at 36–59m</span>
        <span style={badge}>Disadvantaged 15 before Working Parent</span>
        <span style={badge}>2s stack WP+D2 from Sept 2025</span>
      </div>

      {/* Universal table */}
      <EntTable
        title="Universal 15 (3–4s)"
        basis="UNIVERSAL"
        rows={groups.UNIVERSAL}
        onRowChange={updateLocal}
        onSave={saveRow}
      />

      {/* Disadvantaged table */}
      <EntTable
        title="Disadvantaged 15 (eligible 2s)"
        basis="DISADVANTAGED"
        rows={groups.DISADVANTAGED}
        onRowChange={updateLocal}
        onSave={saveRow}
      />

      {/* Working Parent table */}
      <EntTable
        title="Working Parent 15 (9m–4y)"
        basis="WORKING_PARENT"
        rows={groups.WORKING_PARENT}
        onRowChange={updateLocal}
        onSave={saveRow}
        emptyHint={
          <div style={{ padding: 10, color: "#6C7A89" }}>
            No Working Parent 15 bands yet. Click <b>Seed standard bands</b> to add 9–23m, 24–35m and 36–59m rows.
          </div>
        }
      />

      {/* Advanced / Legacy (non-15h or custom) */}
      {showAdvanced && (
        <AdvancedTable
          title="Advanced / Legacy rows (non-15h or custom)"
          rows={groups.OTHER}
          allRows={rows}
          setAllRows={setRows}
          onSave={saveRow}
          busyId={busyId}
        />
      )}

      <div style={{ padding: "6px 10px", ...small }}>
        Changes here feed the child profile (claim type only). Age bands are resolved automatically per term in Funding/Finance.
      </div>
    </div>
  );
}

/* ---------- Full-width editable table for a basis ---------- */
function EntTable({
  title,
  basis,
  rows,
  onRowChange,
  onSave,
  emptyHint,
}: {
  title: string;
  basis: Basis;
  rows: Ent[];
  onRowChange: (row: Ent) => void;
  onSave: (row: Ent) => Promise<void>;
  emptyHint?: React.ReactNode;
}) {
  return (
    <section>
      <div style={{ padding: "12px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <div style={{ fontSize: 12, color: "#6C7A89" }}>
          Issuer: <b>{issuerFor(basis)}</b> · Proof: <b>{proofFor(basis)}</b>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={tableCss}>
          <thead>
            <tr>
              <Th style={{ minWidth: 220 }}>Name</Th>
              <Th style={{ width: 120 }}>Code</Th>
              <Th style={{ width: 120 }}>Min age (m)</Th>
              <Th style={{ width: 150 }}>Max age (m, exclusive)</Th>
              <Th style={{ width: 110 }}>Hours/wk</Th>
              <Th style={{ width: 110 }}>Weeks/yr</Th>
              <Th>Description</Th>
              <Th style={{ width: 110 }}>Active</Th>
              <Th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={9} style={{ color: "#666" }}>
                  {emptyHint ?? "No bands defined for this block type."}
                </Td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id ?? `${basis}-${i}`} style={{ borderTop: "1px solid #F3F3F3" }}>
                  <Td>
                    <input
                      style={input}
                      value={r.name ?? ""}
                      onChange={(e) => onRowChange({ ...r, name: e.currentTarget.value })}
                      placeholder={
                        basis === "UNIVERSAL"
                          ? "Universal 15 (Age 3–4)"
                          : basis === "DISADVANTAGED"
                          ? "Disadvantaged 15 (Age 2)"
                          : "Working Parent 15 (Age band)"
                      }
                    />
                  </Td>
                  <Td>
                    <input
                      style={input}
                      value={r.code ?? ""}
                      onChange={(e) =>
                        onRowChange({
                          ...r,
                          code: e.currentTarget.value.replace(/\s+/g, "_").toUpperCase(),
                        })
                      }
                      placeholder={codeSuggest(basis, r.min_age_months, r.max_age_months)}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      style={input}
                      value={r.min_age_months ?? ""}
                      onChange={(e) =>
                        onRowChange({
                          ...r,
                          min_age_months: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      style={input}
                      value={r.max_age_months ?? ""}
                      onChange={(e) =>
                        onRowChange({
                          ...r,
                          max_age_months: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      style={{ ...input, background: "#F8F8F8" }}
                      readOnly
                      value={15}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      style={input}
                      value={r.weeks_per_year ?? ""}
                      onChange={(e) =>
                        onRowChange({
                          ...r,
                          weeks_per_year: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <input
                      style={input}
                      value={r.description ?? ""}
                      onChange={(e) => onRowChange({ ...r, description: e.currentTarget.value })}
                      placeholder="Short description shown to users"
                    />
                  </Td>
                  <Td>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={r.is_active ?? true}
                        onChange={(e) => onRowChange({ ...r, is_active: e.currentTarget.checked })}
                      />
                      Active
                    </label>
                  </Td>
                  <Td>
                    <button onClick={() => onSave(r)} style={saveBtn}>
                      Save
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Advanced/Legacy (non-15h) ---------- */
function AdvancedTable({
  title,
  rows,
  allRows,
  setAllRows,
  onSave,
  busyId,
}: {
  title: string;
  rows: Ent[];
  allRows: Ent[];
  setAllRows: (rows: Ent[]) => void;
  onSave: (r: Ent) => Promise<void>;
  busyId: string | "NEW" | null;
}) {
  return (
    <section>
      <div style={{ padding: "12px 10px" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <div style={small}>
          Rows here are outside the 15h block model. Keep for history, or deactivate.
        </div>
      </div>
      <div style={tableWrap}>
        <table style={tableCss}>
          <thead>
            <tr>
              <Th style={{ minWidth: 180 }}>Name</Th>
              <Th style={{ width: 130 }}>Code</Th>
              <Th>Description</Th>
              <Th style={{ width: 90 }}>Hours/wk</Th>
              <Th style={{ width: 110 }}>Weeks/yr</Th>
              <Th style={{ width: 110 }}>Min age (m)</Th>
              <Th style={{ width: 130 }}>Max age (m)</Th>
              <Th style={{ width: 120 }}>Working?</Th>
              <Th style={{ width: 140 }}>Means-tested?</Th>
              <Th style={{ width: 100 }}>Active</Th>
              <Th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={11} style={{ color: "#666" }}>
                  No advanced rows.
                </Td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.id ?? `adv-${idx}`} style={{ borderTop: "1px solid #F3F3F3" }}>
                  <Td>
                    <input
                      value={r.name ?? ""}
                      onChange={(e) => {
                        r.name = e.currentTarget.value;
                        setAllRows([...allRows]);
                      }}
                      placeholder="Display name"
                      style={input}
                    />
                  </Td>
                  <Td>
                    <input
                      value={r.code ?? ""}
                      onChange={(e) => {
                        r.code = e.currentTarget.value.replace(/\s+/g, "_").toUpperCase();
                        setAllRows([...allRows]);
                      }}
                      placeholder="e.g. CUSTOM"
                      style={input}
                    />
                  </Td>
                  <Td>
                    <input
                      value={r.description ?? ""}
                      onChange={(e) => {
                        r.description = e.currentTarget.value;
                        setAllRows([...allRows]);
                      }}
                      placeholder="Short description shown to users"
                      style={{ ...input, minWidth: 260 }}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={r.hours_per_week ?? ""}
                      onChange={(e) => {
                        r.hours_per_week = e.currentTarget.value ? Number(e.currentTarget.value) : null;
                        setAllRows([...allRows]);
                      }}
                      style={input}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={r.weeks_per_year ?? ""}
                      onChange={(e) => {
                        r.weeks_per_year = e.currentTarget.value ? Number(e.currentTarget.value) : null;
                        setAllRows([...allRows]);
                      }}
                      style={input}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={r.min_age_months ?? ""}
                      onChange={(e) => {
                        r.min_age_months = e.currentTarget.value ? Number(e.currentTarget.value) : null;
                        setAllRows([...allRows]);
                      }}
                      style={input}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={r.max_age_months ?? ""}
                      onChange={(e) => {
                        r.max_age_months = e.currentTarget.value ? Number(e.currentTarget.value) : null;
                        setAllRows([...allRows]);
                      }}
                      style={input}
                    />
                  </Td>
                  <Td>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!r.requires_working_parent}
                        onChange={(e) => {
                          r.requires_working_parent = e.currentTarget.checked;
                          setAllRows([...allRows]);
                        }}
                      />
                      Required
                    </label>
                  </Td>
                  <Td>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!r.means_tested}
                        onChange={(e) => {
                          r.means_tested = e.currentTarget.checked;
                          setAllRows([...allRows]);
                        }}
                      />
                      Yes
                    </label>
                  </Td>
                  <Td>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={r.is_active ?? true}
                        onChange={(e) => {
                          r.is_active = e.currentTarget.checked;
                          setAllRows([...allRows]);
                        }}
                      />
                      Active
                    </label>
                  </Td>
                  <Td>
                    <button
                      onClick={() => onSave(r)}
                      disabled={busyId != null}
                      style={saveBtn}
                    >
                      {busyId === (r.id ?? "NEW") ? "Saving…" : "Save"}
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- small table helpers ---------- */
function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ ...thCss, ...style }}>{children}</th>;
}
function Td({ children, style, colSpan }: { children: React.ReactNode; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <td style={{ ...tdCss, ...style }} colSpan={colSpan}>
      {children}
    </td>
  );
}

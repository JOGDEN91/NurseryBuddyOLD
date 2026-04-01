"use client";

import { useEffect, useMemo, useState } from "react";

/** ——— tiny UI bits ——— */
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

type Term = { id: string; name: string; is_current?: boolean | null };

type DocType =
  | "declaration_pdf"
  | "birth_certificate"
  | "parent_id"
  | "funding_code_letter";

type Row = {
  enrolment_id: string;
  child_id: string;
  child_name: string;
  age_text?: string | null;
  code_mask?: string | null;
  code_type?: string | null;
  code_status?: "active" | "expired" | "pending" | null;
  hours_week?: number | null;
  stretch: boolean;
  weeks?: number | null;
  updated_at?: string | null;
  traffic: "green" | "amber" | "red";
  docs: Partial<Record<DocType, "approved" | "pending" | "rejected" | "missing">>;
};

type ChildDoc = {
  id: string;
  doc_type: DocType;
  status: "approved" | "pending" | "rejected" | "missing";
  file_url: string | null;
  uploaded_at: string;
};

const DOC_LABEL: Record<DocType, string> = {
  declaration_pdf: "Declaration",
  birth_certificate: "Birth cert",
  parent_id: "Parent ID",
  funding_code_letter: "Code letter",
};

const REQUIRED_DOCS: DocType[] = [
  "declaration_pdf",
  "birth_certificate",
  "parent_id",
  "funding_code_letter",
];

export default function FundingPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
  const anySelected = selectedIds.length > 0;

  // Doc modal state
  const [docChildId, setDocChildId] = useState<string | null>(null);
  const [docChildName, setDocChildName] = useState<string | null>(null);
  const [docList, setDocList] = useState<ChildDoc[] | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [activeDocType, setActiveDocType] = useState<DocType | null>(null);

  async function loadTerms() {
    const res = await fetch("/api/funding/terms", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const list: Term[] = Array.isArray(json?.terms) ? json.terms : [];
    setTerms(list);
    const current = list.find(t => t.is_current);
    setTermId(current?.id || list[0]?.id || "");
  }

  async function loadTable() {
    setLoading(true);
    try {
      const url = new URL("/api/funding/table", window.location.origin);
      if (termId) url.searchParams.set("termId", termId);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.items) ? json.items : []);
      setSelected({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerms();
  }, []);

  useEffect(() => {
    if (termId) loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, includeArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(r => {
      if (!t) return true;
      return (
        r.child_name.toLowerCase().includes(t) ||
        (r.code_mask ?? "").toLowerCase().includes(t)
      );
    });
  }, [rows, q]);

  function toggleAll(checked: boolean) {
    const obj: Record<string, boolean> = {};
    filtered.forEach(r => (obj[r.enrolment_id] = checked));
    setSelected(obj);
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected(s => ({ ...s, [id]: checked }));
  }

  // Export: client-side CSV from current filtered rows
  function exportCsv() {
    const header = [
      "Child",
      "Code",
      "Code type",
      "Code status",
      "Hours/week",
      "Weeks",
      "Stretch",
      "Traffic",
      "Documents (Declaration/BirthCert/ParentID/CodeLetter)",
      "Updated at",
    ];
    const lines = [header.join(",")];
    filtered.forEach(r => {
      const docSummary = REQUIRED_DOCS
        .map(dt => r.docs[dt] ?? "missing")
        .join(" / ");
      const row = [
        r.child_name,
        r.code_mask ?? "",
        r.code_type ?? "",
        r.code_status ?? "",
        r.hours_week ?? "",
        r.weeks ?? "",
        r.stretch ? "yes" : "no",
        r.traffic,
        docSummary,
        r.updated_at ?? "",
      ]
        .map(v => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",");
      lines.push(row);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funding-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Open docs modal; optionally focus a doc type
  async function openDocs(childId: string, childName: string, focus?: DocType) {
    setDocChildId(childId);
    setDocChildName(childName);
    setActiveDocType(focus ?? null);
    setDocLoading(true);
    setDocList(null);
    try {
      const url = new URL("/api/funding/table", window.location.origin);
      url.searchParams.set("childId", childId);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setDocList(Array.isArray(json?.childDocs) ? json.childDocs : []);
    } finally {
      setDocLoading(false);
    }
  }

  function closeDocs() {
    setDocChildId(null);
    setDocList(null);
    setDocChildName(null);
    setActiveDocType(null);
  }

  async function updateDocStatus(docId: string, status: "approved" | "pending" | "rejected") {
    await fetch(`/api/documents/${docId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // Refresh modal + table
    if (docChildId && docChildName) openDocs(docChildId, docChildName, activeDocType ?? undefined);
    loadTable();
  }

  async function requestDoc(childId: string, type: DocType) {
  const res = await fetch("/api/documents/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ child_id: childId, doc_type: type }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j?.error || "Could not request document");
    return;
  }
  alert(`Requested ${DOC_LABEL[type]} from parent`);
}

  function colourFor(status?: "approved" | "pending" | "rejected" | "missing") {
    return status === "approved"
      ? "#4CAF78" // green
      : status === "pending"
      ? "#F9A825" // amber
      : status === "rejected"
      ? "#E53935" // red
      : "#BDBDBD"; // grey (missing)
  }

  const dot = (c: string) => (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 999,
        background: c,
        verticalAlign: "middle",
      }}
    />
  );

  const trafficDot = (t: Row["traffic"]) =>
    t === "green" ? dot("#4CAF78") : t === "red" ? dot("#E53935") : dot("#F9A825");

  // Small round icons with two-letter label
  function docTinyIcon(docType: DocType, status?: "approved" | "pending" | "rejected" | "missing", onClick?: () => void) {
    const bg = colourFor(status);
    const short =
      docType === "declaration_pdf" ? "DE" :
      docType === "birth_certificate" ? "BC" :
      docType === "parent_id" ? "ID" :
      "CL"; // code letter
    return (
      <button
        onClick={onClick}
        title={`${DOC_LABEL[docType]} — ${status ?? "missing"}`}
        style={{
          border: 0,
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          marginRight: 6,
        }}
        aria-label={`${DOC_LABEL[docType]} (${status ?? "missing"})`}
      >
        <span
          style={{
            background: bg,
            color: "#fff",
            width: 24,
            height: 24,
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
          }}
        >
          {short}
        </span>
      </button>
    );
  }

  // Convenience: get files in modal for a given type
  function filesOfType(type: DocType): ChildDoc[] {
    return (docList ?? []).filter(d => d.doc_type === type);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Toolbar */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          style={{ ...input, minWidth: 200 }}
        >
          {terms.length === 0 ? <option>Loading terms…</option> : terms.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.is_current ? " (current)" : ""}
            </option>
          ))}
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by child name or code…"
          style={input}
          onKeyDown={(e) => { if (e.key === "Enter") loadTable(); }}
        />
        <button onClick={loadTable} style={btnGhost}>Search</button>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived children
        </label>

        <div style={{ flex: 1 }} />

        <button onClick={exportCsv} style={btnGhost}>Export CSV</button>
        <button onClick={() => alert("Forms queued (placeholder)")} disabled={!anySelected} style={btn}>
          Send forms
        </button>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 36, padding: 10, borderBottom: "1px solid #EEE" }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected[r.enrolment_id])}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Status</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Child</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Code</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Hours/wk</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Weeks</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Stretch</th>
              {/* SINGLE Documents column */}
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Documents</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 14, opacity: 0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 14, opacity: 0.7 }}>No records.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.enrolment_id} style={{ borderTop: "1px solid #F2F1EE" }}>
                <td style={{ padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!selected[r.enrolment_id]}
                    onChange={(e) => toggleOne(r.enrolment_id, e.target.checked)}
                  />
                </td>
                <td style={{ padding: 10 }}>{trafficDot(r.traffic)}</td>
                <td style={{ padding: 10 }}>
                  <button
                    onClick={() => openDocs(r.child_id, r.child_name)}
                    style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}
                  >
                    {r.child_name}
                  </button>
                </td>
                <td style={{ padding: 10 }}>
                  {r.code_mask ?? "—"}{" "}
                  {r.code_type ? <span style={{ opacity: 0.7, fontSize: 12 }}>({r.code_type})</span> : null}
                </td>
                <td style={{ padding: 10 }}>{r.hours_week ?? "—"}</td>
                <td style={{ padding: 10 }}>{r.weeks ?? "—"}</td>
                <td style={{ padding: 10 }}>{r.stretch ? "Yes" : "No"}</td>

                {/* NEW: one "Documents" column with tiny icons */}
                <td style={{ padding: 10 }}>
                  {REQUIRED_DOCS.map((dt) =>
                    docTinyIcon(dt, r.docs[dt], () => openDocs(r.child_id, r.child_name, dt))
                  )}
                </td>

                <td style={{ padding: 10 }}>{r.updated_at?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Documents modal */}
      {docChildId && (
        <div
          onClick={closeDocs}
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
              width: "min(900px, 96vw)",
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
              <div style={{ fontWeight: 800 }}>{docChildName} — Documents</div>
              <button onClick={closeDocs} style={btnGhost}>Close</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, padding: 12, overflow: "auto" }}>
              {/* Left: Doc type selector + files */}
              <div style={{ ...card, display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Document types</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {REQUIRED_DOCS.map((dt) => {
                    const files = filesOfType(dt);
                    const first = files[0];
                    const status = first?.status ?? "missing";
                    const active = activeDocType === dt || (!activeDocType && REQUIRED_DOCS[0] === dt);
                    return (
                      <button
                        key={dt}
                        onClick={() => setActiveDocType(dt)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          textAlign: "left",
                          borderRadius: 8,
                          padding: "8px 10px",
                          border: "1px solid #E6E4E0",
                          background: active ? "#F5F5F5" : "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {docTinyIcon(dt, status)}
                        <div style={{ display: "grid", lineHeight: 1.1 }}>
                          <div style={{ fontWeight: 700 }}>{DOC_LABEL[dt]}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>{status}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Files list for active type */}
                <div style={{ height: 1, background: "#EEE", margin: "4px 0" }} />
                <div style={{ fontWeight: 700 }}>Files</div>
                {docLoading ? (
                  <div style={{ opacity: 0.7 }}>Loading…</div>
                ) : (activeDocType && filesOfType(activeDocType).length > 0) ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {filesOfType(activeDocType).map((d) => (
                      <div key={d.id} style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <a href={d.file_url ?? "#"} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                            Open file
                          </a>
                          <button onClick={() => updateDocStatus(d.id, "approved")} style={btn}>Approve</button>
                          <button onClick={() => updateDocStatus(d.id, "pending")} style={btnGhost}>Request review</button>
                          <button onClick={() => window.open(d.file_url ?? "#", "_blank")} style={btnGhost}>Print</button>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Uploaded {new Date(d.uploaded_at).toLocaleString()}
                        </div>
                        <div style={{ height: 1, background: "#EEE" }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ opacity: 0.8, fontSize: 14 }}>
                      No file uploaded for <b>{activeDocType ? DOC_LABEL[activeDocType] : "this type"}</b>.
                    </div>
                    {activeDocType && (
                      <button onClick={() => requestDoc(docChildId!, activeDocType)} style={btn}>
                        Request document
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Preview */}
              <div style={{ ...card }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
                {docLoading ? (
                  <div style={{ opacity: 0.7 }}>Loading…</div>
                ) : activeDocType && filesOfType(activeDocType).length > 0 ? (
                  <iframe
                    src={filesOfType(activeDocType)[0].file_url ?? "about:blank"}
                    style={{ width: "100%", height: "60vh", border: 0, background: "#FAFAFA" }}
                  />
                ) : (
                  <div style={{ opacity: 0.7 }}>Select a document type to preview.</div>
                )}
              </div>
            </div>

            <div style={{ padding: 12, borderTop: "1px solid #EEE", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={closeDocs} style={btnGhost}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
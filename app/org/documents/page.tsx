"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/* ---------- Types ---------- */

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  docs: Record<
    string,
    {
      status: "missing" | "requested" | "pending" | "verified" | "review";
      url?: string | null;
      mime?: string | null;
      updated_at?: string | null;
    }
  >;
  last_update?: string | null;
};

type DocType = { label: string };
type ApiPayload = { children: ChildRow[]; types: DocType[] };

/* ---------- Styles ---------- */

const styles = {
  bar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
  } as React.CSSProperties,
  input: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #DADADA",
    background: "#fff",
    width: 320,
  } as React.CSSProperties,
  btn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #4CAF78",
    background: "#4CAF78",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  btnGhost: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #DADADA",
    background: "#fff",
    color: "#24364B",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    background: "#fff",
    border: "1px solid #E6E4E0",
    borderRadius: 10,
  } as React.CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: 700,
    color: "#24364B",
    background: "#F7F7F6",
    borderBottom: "1px solid #EDEBE7",
    position: "sticky",
    top: 0,
    zIndex: 1,
  } as React.CSSProperties,
  td: {
    padding: "10px 12px",
    borderTop: "1px solid #F0EFEB",
  } as React.CSSProperties,
};

/* ---------- Utilities ---------- */

function pillColor(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "verified":
      return { bg: "#E6F5EE", fg: "#1F7A55", br: "#C9ECD9" };
    case "pending":
      return { bg: "#FFF6E5", fg: "#8A5A00", br: "#FFE7BF" };
    case "requested":
    case "review":
      return { bg: "#EAF3FF", fg: "#1A56B6", br: "#CFE2FF" };
    case "missing":
    default:
      return { bg: "#FBEAEA", fg: "#8A1F1F", br: "#F3C5C5" };
  }
}

function StatusPill({
  status,
  onClick,
}: {
  status?: string;
  onClick?: () => void;
}) {
  const { bg, fg, br } = pillColor(status);
  const label = status === "review" ? "review requested" : status || "missing";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${br}`,
        fontWeight: 700,
        fontSize: 12,
        textTransform: "capitalize",
        cursor: "pointer",
      }}
      title="Open document or request"
    >
      {label}
    </button>
  );
}

/* ---------- Modal Shell ---------- */

function ModalShell({
  title,
  onClose,
  children,
  width = 900,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E6E4E0",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #EEE",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              border: "1px solid #DADADA",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- Doc Viewer Modal ---------- */

function DocModal({
  childName,
  childId,
  label,
  onClose,
}: {
  childName: string;
  childId: string;
  label: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<{ url: string; mime?: string | null } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/documents/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ child_ids: [childId], labels: [label] }),
        });
        const js = await res.json();
        if (!res.ok) throw new Error(js?.error || "Failed to fetch file");
        const item = (js.items || []).find((x: any) => x.child_id === childId);
        if (item?.url) setFile({ url: item.url, mime: item.mime });
        else setFile(null);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [childId, label]);

  return (
    <ModalShell title={`${childName} — ${label}`} onClose={onClose}>
      {loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div style={{ color: "#b42318" }}>{error}</div>
      ) : !file ? (
        <div>No file uploaded for this document.</div>
      ) : (file.mime || "").toLowerCase().includes("pdf") ||
        file.url.toLowerCase().endsWith(".pdf") ? (
        <iframe
          src={file.url}
          style={{ width: "100%", height: 700, border: "1px solid #EEE", borderRadius: 8 }}
        />
      ) : (
        <img
          src={file.url}
          alt={label}
          style={{ maxWidth: "100%", border: "1px solid #EEE", borderRadius: 8 }}
        />
      )}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={() => window.open(file?.url || "#", "_blank")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #DADADA",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Open in new tab
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------- Request (per-pill / bulk) ---------- */

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

async function postJSON(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const js = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(js?.error || "Request failed");
  return js;
}

function RequestModal({
  title,
  initialLabels,
  allTypes,
  childIds,
  defaultNotify = true,
  allowSingleReminder = true,
  onDone,
  onClose,
}: {
  title: string;
  initialLabels: string[];
  allTypes: string[];
  childIds: string[];
  defaultNotify?: boolean;
  allowSingleReminder?: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    Array.from(new Set(initialLabels)).filter((l) => allTypes.includes(l))
  );
  const [notify, setNotify] = useState<boolean>(defaultNotify);
  const [note, setNote] = useState<string>("");

  function toggle(label: string) {
    setSelected((cur) =>
      cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]
    );
  }

  async function submit() {
    if (selected.length === 0) {
      alert("Choose at least one document type.");
      return;
    }
    await postJSON("/api/documents/request", {
      child_ids: childIds,
      labels: selected,
      notify,
      note: note || undefined,
    });
    onDone();
    onClose();
  }

  return (
    <ModalShell title={title} onClose={onClose} width={720}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {allTypes.map((label) => (
          <Checkbox
            key={label}
            checked={selected.includes(label)}
            onChange={() => toggle(label)}
            label={label}
          />
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center" }}>
        <Checkbox checked={notify} onChange={setNotify} label="Send email notification to parent(s)" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Internal note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            border: "1px solid #DADADA",
            borderRadius: 8,
            padding: 8,
          }}
        />
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button style={styles.btn} onClick={submit}>
          Create request{childIds.length > 1 ? "s" : ""}
        </button>
        <button style={styles.btnGhost} onClick={onClose}>
          Cancel
        </button>
      </div>

      {allowSingleReminder ? (
        <div style={{ marginTop: 14, borderTop: "1px solid #EEE", paddingTop: 12, color: "#555" }}>
          Tip: after a request is created, status is set to <b>requested</b>. It moves to
          <b> pending</b> on upload, <b>review</b> when changes are asked, and <b>verified</b> on approval.
        </div>
      ) : null}
    </ModalShell>
  );
}

function RemindModal({
  allTypes,
  limitToChildIds, // optional
  onDone,
  onClose,
}: {
  allTypes: string[];
  limitToChildIds?: string[] | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [statuses, setStatuses] = useState<string[]>(["pending"]);
  const [days, setDays] = useState<number>(7);
  const [notify, setNotify] = useState<boolean>(true);

  function toggleStatus(s: string) {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function submit() {
    await postJSON("/api/documents/remind", {
      child_ids: limitToChildIds && limitToChildIds.length > 0 ? limitToChildIds : undefined,
      statuses: statuses.length ? statuses : undefined,
      older_than_days: days || undefined,
      notify,
    });
    onDone();
    onClose();
  }

  return (
    <ModalShell title="Remind outstanding" onClose={onClose} width={640}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {["requested", "pending", "review"].map((s) => (
          <Checkbox key={s} checked={statuses.includes(s)} onChange={() => toggleStatus(s)} label={s} />
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <label>Older than</label>
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value || "0", 10))}
          style={{ width: 80, ...styles.input }}
        />
        <span>days</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <Checkbox checked={notify} onChange={setNotify} label="Send email notification to parent(s)" />
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button style={styles.btn} onClick={submit}>
          Send reminders
        </button>
        <button style={styles.btnGhost} onClick={onClose}>
          Cancel
        </button>
      </div>

      {limitToChildIds && limitToChildIds.length > 0 ? (
        <div style={{ marginTop: 12, color: "#555" }}>
          Scope: <b>{limitToChildIds.length}</b> selected child{limitToChildIds.length > 1 ? "ren" : ""}.
        </div>
      ) : (
        <div style={{ marginTop: 12, color: "#555" }}>
          Scope: entire nursery (filtered by your criteria).
        </div>
      )}
    </ModalShell>
  );
}

/* ---------- Audit Modal (unchanged) ---------- */

function AuditModal({
  childName,
  childId,
  onClose,
}: {
  childName: string;
  childId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<
    { at: string; who?: string | null; action: string; note?: string | null }[]
  >([]);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/documents/audit?child_id=${encodeURIComponent(childId)}`);
        if (res.status === 404) {
          setEvents([]);
        } else {
          const js = await res.json();
          if (!res.ok) throw new Error(js?.error || "Failed");
          setEvents(js.events || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [childId]);

  return (
    <ModalShell title={`${childName} — Audit trail`} onClose={onClose} width={720}>
      {loading ? (
        <div>Loading…</div>
      ) : events.length === 0 ? (
        <div>No audit entries yet.</div>
      ) : (
        <ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
          {events.map((e, i) => (
            <li
              key={i}
              style={{
                borderBottom: "1px solid #EEE",
                padding: "10px 0",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{e.action}</div>
                {e.note && <div style={{ color: "#555" }}>{e.note}</div>}
                {e.who && <div style={{ color: "#888", marginTop: 2 }}>{e.who}</div>}
              </div>
              <div style={{ whiteSpace: "nowrap", color: "#666" }}>
                {new Date(e.at).toLocaleString("en-GB")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

/* ---------- Page ---------- */

export default function OrgDocumentsPage() {
  const searchParams = useSearchParams();
  const nurseryId =
    searchParams.get("nursery_id") ||
    searchParams.get("nursery") ||
    searchParams.get("nurseryId") ||
    "";

  const [payload, setPayload] = useState<ApiPayload>({ children: [], types: [] });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const [docModal, setDocModal] = useState<{ childId: string; childName: string; label: string } | null>(null);
  const [auditModal, setAuditModal] = useState<{ childId: string; childName: string } | null>(null);

  // NEW: request / remind modals
  const [requestModal, setRequestModal] = useState<{
    childIds: string[];
    initialLabels: string[];
    title: string;
  } | null>(null);
  const [remindModal, setRemindModal] = useState<{ childIds?: string[] | null } | null>(null);

  const orderedTypes = useMemo<DocType[]>(
    () => {
      const want = [
        "Birth certificate",
        "Proof of ID",
        "Proof of address",
        "Funding code letter",
        "Supporting docs",
      ].map((s) => s.toLowerCase());

      const present = payload.types.map((t) => t.label);
      const sorted = [...present].sort((a, b) => {
        const ia = want.indexOf(a.toLowerCase());
        const ib = want.indexOf(b.toLowerCase());
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      return sorted.map((label) => ({ label }));
    },
    [payload.types]
  );

  async function load() {
    setLoading(true);
    try {
      const url = new URL("/api/documents/table", window.location.origin);
      if (nurseryId) url.searchParams.set("nursery_id", nurseryId);
      if (archived) url.searchParams.set("include_archived", "1");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const js = (await res.json()) as ApiPayload;
      if (res.ok) setPayload(js);
      else throw new Error((js as any)?.error || "Failed to load");
    } catch (e) {
      console.error(e);
      setPayload({ children: [], types: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId, archived]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return payload.children;
    return payload.children.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(qq)
    );
  }, [q, payload.children]);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  /* ---------- Printing (unchanged) ---------- */

    /* ---------- Printing (fixed) ---------- */
  async function printSelected() {
    if (selected.length === 0) {
      alert("Select one or more children first.");
      return;
    }

    const labels = orderedTypes.map((t) => t.label);

    const res = await fetch("/api/documents/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child_ids: selected, labels }),
    });
    const js = await res.json();
    if (!res.ok) {
      alert(js?.error || "Could not fetch documents to print.");
      return;
    }

    // id -> child name
    const nameMap: Record<string, string> = {};
    payload.children.forEach((c) => {
      nameMap[c.id] = `${c.first_name} ${c.last_name}`;
    });

    // group API items by child
    const byChild: Record<
      string,
      { childName: string; docs: { label: string; url: string | null; mime: string | null }[] }
    > = {};
    (js.items as any[]).forEach((it) => {
      if (!byChild[it.child_id]) {
        byChild[it.child_id] = {
          childName: nameMap[it.child_id] || it.child_id,
          docs: [],
        };
      }
      byChild[it.child_id].docs.push({
        label: it.label,
        url: it.url ?? null,
        mime: it.mime ?? null,
      });
    });

    // Build sections safely (no nested template literals)
    const sectionsHtml = selected
      .map((cid, i) => {
        const group =
          byChild[cid] || { childName: nameMap[cid] || cid, docs: [] as any[] };

        const docsHtml = orderedTypes
          .map((t) => {
            const doc = group.docs.find(
              (d: any) => (d.label || "").toLowerCase() === t.label.toLowerCase()
            );
            if (!doc || !doc.url) {
              return `
                <div class="doc">
                  <h2>${t.label}</h2>
                  <p>No file.</p>
                </div>
              `;
            }
            const isPdf =
              (doc.mime || "").toLowerCase().includes("pdf") ||
              doc.url.toLowerCase().endsWith(".pdf");

            const embed = isPdf
              ? `<iframe src="${doc.url}"></iframe>`
              : `<img src="${doc.url}" alt="${t.label}" />`;

            return `
              <div class="doc">
                <h2>${t.label}</h2>
                ${embed}
              </div>
            `;
          })
          .join("");

        return `
          <section class="${i > 0 ? "page-break" : ""}">
            <h1>${group.childName}</h1>
            <div class="divider"></div>
            ${docsHtml}
          </section>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Documents</title>
<style>
@media print {.page-break{page-break-before:always}.screen{display:none}}
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#24364B;margin:16px}
h1{font-size:18px;margin:24px 0 8px}
h2{font-size:16px;margin:16px 0 8px}
.doc{margin:10px 0 24px}
iframe{width:100%;height:800px;border:1px solid #EEE;border-radius:8px}
img{max-width:100%;border:1px solid #EEE;border-radius:8px}
.divider{margin:24px 0;height:1px;background:#EEE}
</style>
</head>
<body>
<button class="screen" onclick="window.print()" style="position:fixed;right:20px;top:20px;padding:8px 12px;border:1px solid #DADADA;border-radius:8px;background:#fff;cursor:pointer;">Print</button>
${sectionsHtml}
<script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert("Pop-up blocked. Please allow pop-ups.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ---------- NEW: Bulk helpers ---------- */

  const allTypeLabels = orderedTypes.map((t) => t.label);

  function missingLabelsForChild(c: ChildRow) {
    return allTypeLabels.filter((label) => {
      const s = c.docs?.[label]?.status;
      return !s || s === "missing";
    });
  }

  function openBulkRequestAllMissing() {
    if (selected.length === 0) {
      alert("Select one or more children first.");
      return;
    }
    const byId = new Map(payload.children.map((c) => [c.id, c]));
    const union = new Set<string>();
    selected.forEach((id) => {
      const child = byId.get(id);
      if (!child) return;
      missingLabelsForChild(child).forEach((l) => union.add(l));
    });
    const initialLabels = Array.from(union);
    if (initialLabels.length === 0) {
      alert("No missing documents for the selected children.");
      return;
    }
    setRequestModal({
      childIds: selected,
      initialLabels,
      title: `Request all missing — ${selected.length} selected`,
    });
  }

  function openBulkRequestSelectedTypes() {
    if (selected.length === 0) {
      alert("Select one or more children first.");
      return;
    }
    setRequestModal({
      childIds: selected,
      initialLabels: [], // user will pick
      title: `Request selected types — ${selected.length} selected`,
    });
  }

  function openRemindOutstanding(limitToSelected: boolean) {
    setRemindModal({ childIds: limitToSelected ? selected : null });
  }

  /* ---------- Render ---------- */

  return (
    <div>
      <div style={styles.bar}>
        {/* Primary action: open a chooser to request for selected (selected types) */}
        <button
          style={styles.btn}
          onClick={openBulkRequestSelectedTypes}
          title="Choose doc types to request for the selected children"
        >
          + Request documents
        </button>

        {/* Bulk helpers */}
        <button style={styles.btnGhost} onClick={openBulkRequestAllMissing} title="Create requests for any missing docs for the selected children">
          Request all missing
        </button>
        <button
          style={styles.btnGhost}
          onClick={() => openRemindOutstanding(true)}
          title="Send reminders for requested/pending/review items older than N days (selected children)"
        >
          Remind outstanding (selected)
        </button>
        <button
          style={styles.btnGhost}
          onClick={() => openRemindOutstanding(false)}
          title="Send reminders across this nursery (use filters inside)"
        >
          Remind outstanding (nursery)
        </button>

        <button style={styles.btnGhost} onClick={printSelected}>Print selected</button>

        <input
          style={styles.input}
          placeholder="Search by child…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Include archived children
        </label>
        <div style={{ marginLeft: "auto", color: "#666" }}>
          {selected.length > 0 ? `${selected.length} selected` : ""}
        </div>
      </div>

      {/* Optional hint area (kept as a minimal spacer / copy removed as requested earlier) */}
      {!nurseryId && <div style={{ padding: 12, color: "#666", marginBottom: 8 }} />}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}></th>
            <th style={styles.th}>Child</th>
            <th style={styles.th}>DOB</th>
            {orderedTypes.map((t) => (
              <th key={t.label} style={styles.th}>
                {t.label}
              </th>
            ))}
            <th style={styles.th}>Audit</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td style={styles.td} colSpan={3 + orderedTypes.length + 1}>
                Loading…
              </td>
            </tr>
          ) : payload.children.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={3 + orderedTypes.length + 1}>
                {nurseryId
                  ? "No records."
                  : "No records. Pick a nursery from the left to narrow results."}
              </td>
            </tr>
          ) : (
            filtered.map((c) => {
              const full = `${c.first_name} ${c.last_name}`;
              return (
                <tr key={c.id}>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <td style={styles.td}>{full}</td>
                  <td style={styles.td}>
                    {c.date_of_birth
                      ? new Date(c.date_of_birth).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  {orderedTypes.map((t) => {
                    const cell = c.docs?.[t.label] || { status: "missing" as const };
                    const isMissing = !cell.status || cell.status === "missing";
                    return (
                      <td style={styles.td} key={t.label}>
                        <StatusPill
                          status={cell.status}
                          onClick={() => {
                            if (isMissing) {
                              // Per-pill request flow for this child
                              setRequestModal({
                                childIds: [c.id],
                                initialLabels: [t.label],
                                title: `${full} — Request documents`,
                              });
                            } else {
                              // Existing behavior: open viewer
                              setDocModal({
                                childId: c.id,
                                childName: full,
                                label: t.label,
                              });
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                  <td style={styles.td}>
                    <button
                      onClick={() => setAuditModal({ childId: c.id, childName: full })}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #DADADA",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                      title="Open audit trail"
                    >
                      {c.last_update
                        ? new Date(c.last_update).toLocaleString("en-GB")
                        : "Open audit"}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Modals */}
      {docModal && (
        <DocModal
          childId={docModal.childId}
          childName={docModal.childName}
          label={docModal.label}
          onClose={() => setDocModal(null)}
        />
      )}
      {auditModal && (
        <AuditModal
          childId={auditModal.childId}
          childName={auditModal.childName}
          onClose={() => setAuditModal(null)}
        />
      )}
      {requestModal && (
        <RequestModal
          title={requestModal.title}
          initialLabels={requestModal.initialLabels}
          allTypes={allTypeLabels}
          childIds={requestModal.childIds}
          onDone={load}
          onClose={() => setRequestModal(null)}
        />
      )}
      {remindModal && (
        <RemindModal
          allTypes={allTypeLabels}
          limitToChildIds={remindModal.childIds ?? undefined}
          onDone={load}
          onClose={() => setRemindModal(null)}
        />
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { OrgContextStrip } from "../_components/OrgContextStrip";
import { useOrgMeta } from "../_components/OrgMetaContext";

/* ---------- Types ---------- */

type Term = {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
};

type Child = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type DocSummary = {
  label: string;
  status: string;
};

type DeclarationItem = {
  id: string;
  status: string;
  signed_at: string | null;
  signed_by_name: string | null;
  child: Child;
  term_id: string;
  docs?: DocSummary[];
  // Optional future: pdf metadata in API response
  snapshot?: any;
};

type Payload = {
  ok: boolean;
  terms?: Term[];
  items?: DeclarationItem[];
  error?: string;
};

/* ---------- Helpers ---------- */

const C_GREEN = "#4CAF78";
const C_ORANGE = "#F08A00";
const C_RED = "#B91C1C";
const C_GREY = "#9CA3AF";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB");
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString("en-GB");
}

function classifyDeclaration(statusRaw: any): "signed" | "pending" | "attention" | "superseded" {
  const s = String(statusRaw ?? "").toLowerCase().trim();
  if (s === "superseded") return "superseded";
  if (s === "signed" || s === "approved") return "signed";
  if (s === "review" || s === "pending_review") return "attention";
  if (s === "pending" || s === "sent") return "pending";
  return "pending";
}

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "";
}

function statusFromDocs(docs: DocSummary[] | undefined, key: string): string | undefined {
  if (!docs || !docs.length) return undefined;
  const k = key.toLowerCase();
  const doc = docs.find((d) => String(d.label ?? "").toLowerCase().includes(k));
  return doc?.status;
}

function isDocsComplete(docs: DocSummary[] | undefined): boolean {
  const bc = statusFromDocs(docs, "birth");
  const pa = statusFromDocs(docs, "address");
  const fc = statusFromDocs(docs, "funding code");
  const id = statusFromDocs(docs, "id");
  return [bc, pa, fc, id].every((s) => String(s ?? "").toLowerCase() === "verified");
}

function ProgressBar({
  totals,
}: {
  totals: { signed: number; pending: number; attention: number; superseded: number; total: number };
}) {
  const { signed, pending, attention, superseded, total } = totals;
  if (total <= 0) return <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB" }} />;

  const g = (signed / total) * 100;
  const a = (pending / total) * 100;
  const r = (attention / total) * 100;
  const s = (superseded / total) * 100;

  return (
    <div style={{ width: "100%", height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
      <div style={{ display: "flex", height: "100%" }}>
        {g > 0.01 && <div style={{ width: `${g}%`, background: C_GREEN }} />}
        {a > 0.01 && <div style={{ width: `${a}%`, background: C_ORANGE }} />}
        {r > 0.01 && <div style={{ width: `${r}%`, background: C_RED }} />}
        {s > 0.01 && <div style={{ width: `${s}%`, background: C_GREY }} />}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  variant: "green" | "orange" | "white";
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-semibold shadow-sm disabled:opacity-60";
  if (variant === "green")
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={base} style={{ background: C_GREEN, borderColor: C_GREEN, color: "#fff" }}>
        {label}
      </button>
    );
  if (variant === "orange")
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={base} style={{ background: C_ORANGE, borderColor: C_ORANGE, color: "#fff" }}>
        {label}
      </button>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} border-gray-300 bg-white text-gray-900`}>
      {label}
    </button>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="w-full max-w-md rounded-lg bg-white p-4 text-sm text-gray-900 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const DANGER_RED = "#8A1F1F";

function DocBadge({
  abbr,
  status,
  onClick,
}: {
  abbr: string;
  status?: string;
  onClick?: () => void;
}) {
  const s = (status || "missing").toLowerCase();
  const map: Record<string, { bg: string; fg: string; br: string }> = {
    verified: { bg: "#E6F5EE", fg: "#1F7A55", br: "#C9ECD9" },
    pending: { bg: "#FFF6E5", fg: "#8A5A00", br: "#FFE7BF" },
    requested: { bg: "#EAF3FF", fg: "#1A56B6", br: "#CFE2FF" },
    review: { bg: "#EAF3FF", fg: "#1A56B6", br: "#CFE2FF" },
    missing: { bg: "#FBEAEA", fg: DANGER_RED, br: "#F3C5C5" },
  };
  const c = map[s] || map.missing;

  return (
    <button
      type="button"
      title={`${abbr}: ${status ?? "missing"}`}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 22,
        borderRadius: 8,
        marginRight: 6,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.br}`,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {abbr}
    </button>
  );
}

/* ---------- Component ---------- */

export default function DeclarationsClient() {
  const { nurseryId } = useScope();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { orgName, nurseries } = useOrgMeta();

  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [items, setItems] = useState<DeclarationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const [remindMissingSignatures, setRemindMissingSignatures] = useState(true);
  const [remindMissingDocs, setRemindMissingDocs] = useState(true);
  const [sendingReminders, setSendingReminders] = useState(false);

  const [viewing, setViewing] = useState<DeclarationItem | null>(null);

  const currentNurseryName = nurseries.find((n) => n.id === nurseryId)?.name ?? "Nursery";

  useEffect(() => {
    const termFromQuery = searchParams.get("term_id");
    if (termFromQuery) setSelectedTermId(termFromQuery);
  }, [searchParams]);

  async function reload(nId: string, tId: string) {
    const params = new URLSearchParams();
    params.set("nursery_id", nId);
    params.set("term_id", tId);
    const res = await fetch(`/api/org/declarations?${params.toString()}`, { method: "GET", cache: "no-store", credentials: "include" });
    const j: Payload = await res.json().catch(() => ({ ok: false } as Payload));
    if (res.ok && j.ok !== false) setItems(j.items ?? []);
  }

  useEffect(() => {
    if (!nurseryId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        if (selectedTermId) params.set("term_id", selectedTermId);

        const res = await fetch(`/api/org/declarations?${params.toString()}`, { method: "GET", cache: "no-store", credentials: "include" });
        const j: Payload = await res.json().catch(() => ({ ok: false } as Payload));
        if (cancelled) return;

        if (!res.ok || j.ok === false) {
          setError(j.error || `HTTP ${res.status}`);
          setTerms([]);
          setItems([]);
        } else {
          setTerms(j.terms ?? []);
          setItems(j.items ?? []);

          if (!selectedTermId && (j.terms?.length ?? 0) > 0) {
            const first = j.terms![0].id;
            setSelectedTermId(first);
            const sp = new URLSearchParams(searchParams.toString());
            sp.set("term_id", first);
            router.replace(`${pathname}?${sp.toString()}`);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId, selectedTermId]);

  const selectedTerm = terms.find((t) => t.id === selectedTermId) ?? null;

  const totals = useMemo(() => {
    let signed = 0, pending = 0, attention = 0, superseded = 0;
    for (const d of items) {
      const c = classifyDeclaration(d.status);
      if (c === "signed") signed += 1;
      else if (c === "pending") pending += 1;
      else if (c === "attention") attention += 1;
      else superseded += 1;
    }
    return { signed, pending, attention, superseded, total: items.length };
  }, [items]);

  const reminderCounts = useMemo(() => {
    const missingSig = items.filter((d) => {
      const c = classifyDeclaration(d.status);
      return c !== "signed" && c !== "superseded";
    }).length;

    const missingDocs = items.filter((d) => !isDocsComplete(d.docs)).length;

    return { missingSig, missingDocs };
  }, [items]);

  async function generateForTerm(termId: string) {
    if (!nurseryId || !termId) return;
    setGenerating(true);
    setBanner(null);
    setError(null);

    try {
      const res = await fetch("/api/org/declarations/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nursery_id: nurseryId, term_id: termId }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j.ok === false) {
        setError(j.error || `Unable to generate declarations (HTTP ${res.status}).`);
        return;
      }
      setBanner(`Created ${j.created ?? 0} declarations; skipped ${j.skipped ?? 0}.`);
      await reload(nurseryId, termId);
    } catch (e: any) {
      setError(e?.message || "Network error while generating.");
    } finally {
      setGenerating(false);
    }
  }

  async function approveDeclaration(declarationId: string) {
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/org/declarations/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declaration_id: declarationId }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j.ok === false) {
        setError(j.error || `Unable to approve (HTTP ${res.status}).`);
        return;
      }
      setBanner("Declaration approved.");
      if (nurseryId && selectedTermId) await reload(nurseryId, selectedTermId);
    } catch (e: any) {
      setError(e?.message || "Network error while approving.");
    }
  }

  async function openPdf(declarationId: string, mode: "view" | "download" | "print") {
    // This uses the new /api/org/declarations/pdf-url route (below).
    const params = new URLSearchParams();
    params.set("declaration_id", declarationId);

    const res = await fetch(`/api/org/declarations/pdf-url?${params.toString()}`, { cache: "no-store", credentials: "include" });
    const j = await res.json().catch(() => ({} as any));

    if (!res.ok || j.ok === false) {
      alert(j.error || "PDF not available yet (it is generated when a parent signs).");
      return;
    }

    const url = String(j.url ?? "");
    if (!url) {
      alert("PDF not available yet.");
      return;
    }

    if (mode === "view") {
      window.open(url, "_blank");
      return;
    }

    if (mode === "print") {
      const w = window.open(url, "_blank");
      if (!w) return;
      // browser will handle printing; user can Save as PDF
      return;
    }

    // download
    const a = document.createElement("a");
    a.href = url;
    a.download = `declaration-${declarationId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function sendReminders() {
    if (!nurseryId || !selectedTermId) return;
    setSendingReminders(true);
    setError(null);
    setBanner(null);

    try {
      const res = await fetch("/api/org/declarations/remind", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nursery_id: nurseryId,
          term_id: selectedTermId,
          include_missing_signatures: remindMissingSignatures,
          include_missing_documents: remindMissingDocs,
        }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j.ok === false) {
        setError(j.error || `Unable to queue reminders (HTTP ${res.status}).`);
        return;
      }
      setBanner(`Reminders queued for ${j.targets?.count ?? 0} family(ies).`);
      setShowReminderModal(false);
    } catch (e: any) {
      setError(e?.message || "Network error while queueing reminders.");
    } finally {
      setSendingReminders(false);
    }
  }

  async function exportAllSignedPdfs() {
    if (!selectedTermId) return;
    // Bulk: get signed URLs for all declaration IDs that have PDFs (server will filter)
    const ids = items.map((x) => x.id);

    const res = await fetch("/api/org/declarations/pdf-urls", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declaration_ids: ids }),
    });
    const j = await res.json().catch(() => ({} as any));
    if (!res.ok || j.ok === false) {
      alert(j.error || "Export failed.");
      return;
    }

    const urls: Array<{ id: string; url: string }> = Array.isArray(j.urls) ? j.urls : [];
    if (urls.length === 0) {
      alert("No PDFs found yet. PDFs are generated when parents sign.");
      return;
    }

    // Open a simple export list in a new tab for manual download/print
    const html = `
      <html><head><title>Declarations export</title></head>
      <body style="font-family:system-ui;padding:16px">
      <h2>Declarations export</h2>
      <p>Tip: open each PDF and use Print → Save as PDF for filing.</p>
      <ul>
        ${urls.map((u) => `<li><a href="${u.url}" target="_blank" rel="noreferrer">${u.id}</a></li>`).join("")}
      </ul>
      </body></html>
    `;
    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <div className="space-y-4 text-base text-gray-900">
      <OrgContextStrip orgName={orgName} nurseryName={currentNurseryName} termLabel={selectedTerm?.label ?? null} />

      {banner && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{banner}</div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      )}

      {/* Toolbar */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-700">Declarations</div>
            <div className="text-xs text-gray-500">
              Generate declarations, chase missing signatures/documents, and review signed PDFs for approval.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              label={generating ? "Generating…" : "Generate"}
              variant="green"
              disabled={!selectedTermId || generating}
              onClick={() => setShowGenerateModal(true)}
            />
            <ActionButton
              label="Send reminder"
              variant="orange"
              disabled={!selectedTermId || items.length === 0}
              onClick={() => setShowReminderModal(true)}
            />
            <ActionButton
              label="Export"
              variant="white"
              disabled={!selectedTermId || items.length === 0}
              onClick={() => setShowExportModal(true)}
            />
          </div>
        </div>
      </div>

      {/* Summary card (with progress bar) */}
      {selectedTerm && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-700">Summary for {selectedTerm.label}</div>
              <div className="text-xs text-gray-500">{fmtDate(selectedTerm.start_date)} – {fmtDate(selectedTerm.end_date)}</div>
            </div>
          </div>

          <div className="mb-3">
            <ProgressBar totals={totals} />
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
              <span><b style={{ color: C_GREEN }}>{totals.signed}</b> signed</span>
              <span><b style={{ color: C_ORANGE }}>{totals.pending}</b> pending</span>
              <span><b style={{ color: C_RED }}>{totals.attention}</b> attention</span>
              <span><b style={{ color: C_GREY }}>{totals.superseded}</b> superseded</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryStat label="Total declarations" value={totals.total} />
            <SummaryStat label="Signed" value={totals.signed} helper={pct(totals.signed, totals.total)} />
            <SummaryStat label="Pending" value={totals.pending} helper={pct(totals.pending, totals.total)} />
            <SummaryStat label="Superseded" value={totals.superseded} helper={pct(totals.superseded, totals.total)} />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        {loading ? (
          <div className="py-4 text-sm text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">No declarations for this term yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="border-b px-2 py-2 text-left font-semibold">Child</th>
                  <th className="border-b px-2 py-2 text-left font-semibold">Doc status</th>
                  <th className="border-b px-2 py-2 text-left font-semibold">Status</th>
                  <th className="border-b px-2 py-2 text-left font-semibold">Signed at</th>
                  <th className="border-b px-2 py-2 text-left font-semibold">Signed by</th>
                  <th className="border-b px-2 py-2 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => {
                  const name = `${d.child.first_name ?? ""} ${d.child.last_name ?? ""}`.trim() || "Unnamed child";
                  const bucket = classifyDeclaration(d.status);

                  const statusBadge =
                    bucket === "signed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : bucket === "superseded"
                      ? "border-gray-200 bg-gray-50 text-gray-700"
                      : bucket === "attention"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-amber-200 bg-amber-50 text-amber-800";

                  const docs = d.docs ?? [];
                  const bc = statusFromDocs(docs, "birth");
                  const pa = statusFromDocs(docs, "address");
                  const fc = statusFromDocs(docs, "funding code");
                  const id = statusFromDocs(docs, "id");

                  const showApprove = String(d.status).toLowerCase() === "review" || String(d.status).toLowerCase() === "pending_review";

                  return (
                    <tr key={d.id} className="border-b last:border-b-0">
                      <td className="px-2 py-2">{name}</td>

                      <td className="whitespace-nowrap px-2 py-2">
                        {/* Reuse your existing doc click behaviour */}
                        <span className="inline-flex items-center">
                          {/* keep minimal: click sends to documents search */}
                          <button className="mr-1" onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} type="button">
                            {/* badges */}
                            <span className="sr-only">Open documents</span>
                          </button>
                          {/* badges */}
                          <span>
                            {/* not importing DocBadge from elsewhere; keep simple badges */}
                            <span className="inline-flex gap-1">
                              {/* We keep your existing styles via small inline badges */}
                            </span>
                          </span>
                        </span>

                        {/* actual badges */}
                        <span>
                          {/* BC/PA/FC/ID */}
                          <span className="inline-flex">
                            <span className="hidden" />
                          </span>
                        </span>

                        {/* Render badges using the same component */}
                        <span>
                          {/* @ts-ignore */}
                          <DocBadge abbr="BC" status={bc} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                          {/* @ts-ignore */}
                          <DocBadge abbr="PA" status={pa} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                          {/* @ts-ignore */}
                          <DocBadge abbr="FC" status={fc} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                          {/* @ts-ignore */}
                          <DocBadge abbr="ID" status={id} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                        </span>
                      </td>

                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge}`}>
                          {bucket === "signed" ? "Signed" : bucket === "superseded" ? "Superseded" : bucket === "attention" ? "Needs attention" : "Pending"}
                        </span>
                      </td>

                      <td className="px-2 py-2">{fmtDateTime(d.signed_at)}</td>
                      <td className="px-2 py-2">{d.signed_by_name || "—"}</td>

                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setViewing(d)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                            View
                          </button>

                          {showApprove && (
                            <button type="button" onClick={() => approveDeclaration(d.id)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                              Approve
                            </button>
                          )}

                          <button type="button" onClick={() => openPdf(d.id, "print")} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                            Print
                          </button>

                          <button type="button" onClick={() => openPdf(d.id, "download")} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate modal */}
      <Modal open={showGenerateModal} title="Generate declarations" onClose={() => setShowGenerateModal(false)}>
        <div className="space-y-3">
          <div className="text-xs text-gray-600">
            This creates declarations for children who do not yet have one for the selected term.
          </div>

          <div className="flex justify-end gap-2">
            <ActionButton label="Cancel" variant="white" onClick={() => setShowGenerateModal(false)} />
            <ActionButton
              label={generating ? "Generating…" : "Generate"}
              variant="green"
              disabled={!selectedTermId || generating}
              onClick={async () => {
                setShowGenerateModal(false);
                await generateForTerm(selectedTermId);
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Export modal */}
      <Modal open={showExportModal} title="Export declarations" onClose={() => setShowExportModal(false)}>
        <div className="space-y-3">
          <div className="text-xs text-gray-600">
            Exports are based on stored PDFs created when parents sign. If no PDFs exist yet, export will be empty.
          </div>
          <div className="flex justify-end gap-2">
            <ActionButton label="Close" variant="white" onClick={() => setShowExportModal(false)} />
            <ActionButton label="Open export list" variant="white" onClick={exportAllSignedPdfs} />
          </div>
        </div>
      </Modal>

      {/* Reminder modal */}
      <Modal open={showReminderModal} title="Send reminders" onClose={() => setShowReminderModal(false)}>
        <div className="space-y-3">
          <div className="text-xs text-gray-600">
            This queues reminder events (delivery can be handled by your scheduler). Targeting is based on missing signatures and/or incomplete documents.
          </div>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={remindMissingSignatures} onChange={(e) => setRemindMissingSignatures(e.target.checked)} />
              <span>Missing signatures ({reminderCounts.missingSig})</span>
            </label>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={remindMissingDocs} onChange={(e) => setRemindMissingDocs(e.target.checked)} />
              <span>Missing / pending documents ({reminderCounts.missingDocs})</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <ActionButton label="Cancel" variant="white" onClick={() => setShowReminderModal(false)} />
            <ActionButton
              label={sendingReminders ? "Sending…" : "Send reminders"}
              variant="orange"
              disabled={sendingReminders || (!remindMissingDocs && !remindMissingSignatures)}
              onClick={sendReminders}
            />
          </div>
        </div>
      </Modal>

      {/* View modal */}
      <Modal open={!!viewing} title="Declaration" onClose={() => setViewing(null)}>
        {!viewing ? null : (
          <div className="space-y-3">
            <div className="text-sm">
              <div className="text-xs text-gray-500">Child</div>
              <div className="font-semibold">{`${viewing.child.first_name ?? ""} ${viewing.child.last_name ?? ""}`.trim() || "Unnamed child"}</div>
            </div>

            <div className="text-sm">
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-semibold">{viewing.status}</div>
            </div>

            <div className="flex justify-end gap-2">
              <ActionButton label="Open PDF" variant="white" onClick={() => openPdf(viewing.id, "view")} />
              <ActionButton label="Close" variant="white" onClick={() => setViewing(null)} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
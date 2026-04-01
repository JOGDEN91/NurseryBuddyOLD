"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ---------------- Types ---------------- */
export type Doc = {
  id?: string | number;
  la_id?: string;
  doc_type: string;
  title?: string | null;
  url?: string | null;
  notes?: string | null;
  status?: string | null;
  storage_path?: string | null; // legacy table may have this
  version?: string | null;
  effective_from?: string | null;
};

type Props = {
  laId: string;
  laName?: string;
  documents: Doc[];
};

/** ---------------- Small utilities ---------------- */
const lc = (s?: string | null) => (s || "").toLowerCase();
const todayISO = () => new Date().toISOString().slice(0, 10);

function getDoc(docs: Doc[], type: string): Doc | undefined {
  const t = type.toLowerCase();
  return (docs || []).find((d) => lc(d.doc_type) === t);
}

/** All fetches: include credentials + no-store + JSON */
async function postJSON(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      (text && text.slice(0, 400)) ||
      `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json ?? {};
}

async function getJSON(url: string) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      (text && text.slice(0, 400)) ||
      `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json ?? {};
}

/** ---------------- readUrl / writeUrl wrappers ---------------- */
async function writeUrl(
  laId: string,
  docType: string,
  url: string,
  opts?: { title?: string; notes?: string | null }
) {
  return postJSON("/api/admin/local-authorities/save-link", {
    laId,
    doc_type: docType,
    url,
    title: opts?.title,
    notes: opts?.notes ?? null,
  });
}

function readUrlFromDocs(docs: Doc[], type: string) {
  return (getDoc(docs, type)?.url || "").toString();
}

/** ---------------- Component ---------------- */
export default function LAViewClient({ laId, laName, documents }: Props) {
  /** Messages (transient) */
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  /** Reliable LA id for all API calls */
  const effectiveLaId = useMemo(() => {
    if (laId && String(laId).trim()) return String(laId).trim();
    const fromDocs = (documents || []).find((d) => d.la_id)?.la_id;
    return fromDocs ? String(fromDocs) : "";
  }, [laId, documents]);

  /** ---------- Top links (Public + Provider portal) ---------- */
  const [publicUrl, setPublicUrl] = useState<string>(
    readUrlFromDocs(documents, "public_site")
  );
  const [portalUrl, setPortalUrl] = useState<string>(
    readUrlFromDocs(documents, "provider_portal")
  );
  const [linksBusy, setLinksBusy] = useState(false);

  async function onSaveLinks() {
    setLinksBusy(true);
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      const jobs: Promise<any>[] = [];
      if (publicUrl.trim()) {
        jobs.push(
          writeUrl(effectiveLaId, "public_site", publicUrl.trim(), {
            title: "Public site",
          })
        );
      }
      if (portalUrl.trim()) {
        jobs.push(
          writeUrl(effectiveLaId, "provider_portal", portalUrl.trim(), {
            title: "Provider portal",
          })
        );
      }
      if (!jobs.length) throw new Error("Nothing to save.");
      await Promise.all(jobs);
      setMessage("Links saved.");
    } catch (e: any) {
      setMessage(e?.message || "Save failed.");
    } finally {
      setLinksBusy(false);
    }
  }

  /** ---------- Term dates: Source & candidates ---------- */
  const existingSourceDoc =
    getDoc(documents, "term_dates_source") || getDoc(documents, "term_dates"); // legacy read

  const [sourceUrl, setSourceUrl] = useState<string>(existingSourceDoc?.url || "");
  const [approved, setApproved] = useState<boolean>(
    (existingSourceDoc?.notes || "").toLowerCase().includes("approved")
  );
  const [testing, setTesting] = useState(false);
  const [lastTestInfo, setLastTestInfo] = useState<string | null>(null);

  const [crawlModeBusy, setCrawlModeBusy] = useState<"preview" | "apply" | null>(null);
  const [previewRows, setPreviewRows] = useState<
    { term_name: string; start: string; end: string }[]
  >([]);

  const initialCandidates = useMemo(
    () => (documents || []).filter((d) => lc(d.doc_type) === "term_dates_candidate"),
    [documents]
  );
  const [candidates, setCandidates] = useState<Doc[]>(initialCandidates);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  async function onTestUrl() {
    setTesting(true);
    setMessage(null);
    try {
      if (!sourceUrl.trim()) throw new Error("Enter a source URL first.");
      const res = await postJSON("/api/admin/local-authorities/probe", {
        url: sourceUrl.trim(),
      });
      const info = `HTTP ${res.http_status ?? "?"}${
        res.content_type ? ` · ${res.content_type}` : ""
      }`;
      setLastTestInfo(info);
      setMessage(`Test OK (${info}).`);
    } catch (e: any) {
      setLastTestInfo(null);
      setMessage(e?.message || "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function onSaveSource() {
    setSaveBusy(true);
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      if (!sourceUrl.trim()) throw new Error("Enter a source URL.");
      await writeUrl(effectiveLaId, "term_dates_source", sourceUrl.trim(), {
        title: "Source: Term dates",
        notes: approved ? `approved ${todayISO()}` : existingSourceDoc?.notes ?? null,
      });
      setMessage("Source saved.");
    } catch (e: any) {
      setMessage(e?.message || "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function onApproveSource() {
    setSaveBusy(true);
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      if (!sourceUrl.trim()) throw new Error("Enter a source URL.");
      await writeUrl(effectiveLaId, "term_dates_source", sourceUrl.trim(), {
        title: "Source: Term dates",
        notes: `approved ${todayISO()}`,
      });
      setApproved(true);
      setMessage("Source approved.");
    } catch (e: any) {
      setMessage(e?.message || "Approve failed.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function onPreviewCrawl() {
    setCrawlModeBusy("preview");
    setMessage(null);
    setPreviewRows([]);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      const res = await postJSON("/api/admin/local-authorities/crawl", {
        laId: effectiveLaId,
        section: "term_dates",
        url: sourceUrl?.trim() || undefined,
        mode: "preview",
      });
      const found = (res.found || []) as { term_name: string; start: string; end: string }[];
      setPreviewRows(found);
      const pct = Math.round((res.confidence ?? 0) * 100);
      setMessage(`Preview: found ${found.length} rows (confidence ${pct}%).`);
    } catch (e: any) {
      setMessage(e?.message || "Preview failed.");
    } finally {
      setCrawlModeBusy(null);
    }
  }

  async function onApplyCrawl() {
    setCrawlModeBusy("apply");
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      if (!approved) throw new Error("Approve the source URL before applying.");
      const res = await postJSON("/api/admin/local-authorities/crawl", {
        laId: effectiveLaId,
        section: "term_dates",
        url: sourceUrl?.trim() || undefined,
        mode: "apply",
      });
      setMessage(
        `Applied: upserted ${res.upserted ?? 0}, skipped ${res.skipped ?? 0}.`
      );
    } catch (e: any) {
      setMessage(e?.message || "Apply failed.");
    } finally {
      setCrawlModeBusy(null);
    }
  }

  async function onSuggestCandidates() {
    setSuggestBusy(true);
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      const res = await postJSON("/api/admin/local-authorities/suggest", {
        laId: effectiveLaId,
        section: "term_dates",
        max: 6,
      });
      const got: Doc[] = (res.candidates || []) as Doc[];
      if (!got.length) {
        setMessage("No candidates found (ensure Public/Portal links are set).");
      } else {
        const seen = new Set(
          candidates.map((c) => (c.id ? `id:${c.id}` : `url:${c.url}`))
        );
        const merged = [...candidates];
        for (const d of got) {
          const key = d.id ? `id:${d.id}` : `url:${d.url}`;
          if (!seen.has(key)) {
            merged.push(d);
            seen.add(key);
          }
        }
        setCandidates(merged);
        setMessage(`Added ${got.length} candidate${got.length === 1 ? "" : "s"}.`);
      }
    } catch (e: any) {
      setMessage(e?.message || "Suggest failed.");
    } finally {
      setSuggestBusy(false);
    }
  }

  async function onPromoteCandidate(c: Doc) {
    setSaveBusy(true);
    setMessage(null);
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      if (!c.url) throw new Error("Candidate URL is missing.");
      await writeUrl(effectiveLaId, "term_dates_source", c.url, {
        title: "Source: Term dates",
        notes: `approved ${todayISO()}`,
      });
      setApproved(true);
      setSourceUrl(c.url);
      setCandidates((arr) => arr.filter((x) => x !== c));
      setMessage("Candidate promoted to approved source.");
    } catch (e: any) {
      setMessage(e?.message || "Promote failed.");
    } finally {
      setSaveBusy(false);
    }
  }

  function onRemoveCandidate(c: Doc) {
    setCandidates((arr) => arr.filter((x) => x !== c));
    setMessage("Candidate removed.");
  }

  /** ---------- Documents: editable table ---------- */
  type DocRow = Doc;
  const [docRows, setDocRows] = useState<DocRow[]>(documents || []);
  const [docEditing, setDocEditing] = useState<Record<string, boolean>>({});
  const [docMsg, setDocMsg] = useState<string | null>(null);

  function toggleDocEdit(id: any, on: boolean) {
    setDocEditing((m) => ({ ...m, [String(id)]: on }));
  }

  function addDocDraft() {
    const draft: DocRow = {
      id: `new-${Date.now()}`,
      doc_type: "guidance",
      title: "",
      version: "",
      effective_from: todayISO(),
      url: "",
      notes: "",
    };
    setDocRows((r) => [draft, ...r]);
    toggleDocEdit(draft.id!, true);
  }

  async function saveDoc(idx: number) {
    setDocMsg(null);
    const r = docRows[idx];
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      const isNew = typeof r.id === "string" && String(r.id).startsWith("new-");
      const payload = {
        id: isNew ? undefined : r.id,
        laId: effectiveLaId,
        doc_type: r.doc_type,
        title: r.title ?? null,
        version: r.version ?? null,
        effective_from: r.effective_from ?? null,
        url: r.url ?? null,
        notes: r.notes ?? null,
      };
      const res = await postJSON("/api/admin/local-authorities/documents", {
        mode: isNew ? "insert" : "update",
        row: payload,
      });
      const saved = res.row as DocRow;
      setDocRows((rs) => rs.map((x, i) => (i === idx ? saved : x)));
      toggleDocEdit(String(docRows[idx].id ?? saved.id), false);
      setDocMsg("Document saved.");
    } catch (e: any) {
      setDocMsg(e?.message || "Save failed.");
    }
  }

  async function deleteDoc(idx: number) {
    setDocMsg(null);
    const r = docRows[idx];
    if (!r.id || String(r.id).startsWith("new-")) {
      setDocRows((rs) => rs.filter((_, i) => i !== idx));
      return;
    }
    try {
      if (!effectiveLaId) throw new Error("Missing laId from page loader.");
      await postJSON("/api/admin/local-authorities/documents", {
        mode: "delete",
        row: { id: r.id, laId: effectiveLaId },
      });
      setDocRows((rs) => rs.filter((_, i) => i !== idx));
      setDocMsg("Document deleted.");
    } catch (e: any) {
      setDocMsg(e?.message || "Delete failed.");
    }
  }

  /** ---------- Funding summaries (org-entered) ---------- */
  type RateSummary = {
    entitlement_id: string;
    entitlement_code?: string | null;
    entitlement_name?: string | null;
    hours_per_week?: number | null;
    total_orgs: number;
    rows: Array<{ rate_hour: number; org_count: number; share: number }>;
  };

  type WindowSummary = {
    period_code: string;
    total_orgs: number;
    min_opens?: string | null;
    max_opens?: string | null;
    min_closes?: string | null;
    max_closes?: string | null;
    rows: Array<{ duration_days: number; org_count: number; share: number }>;
  };

  // Existing LA term-dates rows (from la_term_dates)
  type TermRow = {
    id: string;
    term_name: string;
    academic_year?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
  };

  const [rates, setRates] = useState<RateSummary[] | null>(null);
  const [ratesErr, setRatesErr] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  const [windows, setWindows] = useState<WindowSummary[] | null>(null);
  const [windowsErr, setWindowsErr] = useState<string | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  const [termRows, setTermRows] = useState<TermRow[] | null>(null);
  const [termsErr, setTermsErr] = useState<string | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);

  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termDraft, setTermDraft] = useState<Partial<TermRow>>({});
  const [termSaving, setTermSaving] = useState(false);

  const startEditTerm = (row: TermRow) => {
    setEditingTermId(row.id);
    setTermDraft({
      term_name: row.term_name,
      academic_year: row.academic_year,
      start_date: row.start_date?.slice(0, 10) ?? null,
      end_date: row.end_date?.slice(0, 10) ?? null,
      notes: row.notes ?? "",
    });
  };

  const cancelEditTerm = () => {
    setEditingTermId(null);
    setTermDraft({});
  };

  const updateDraftField = (field: keyof TermRow, value: string | null) => {
    setTermDraft((prev) => ({ ...prev, [field]: value }));
  };

  const saveEditTerm = async (id: string) => {
    if (!termRows) return;
    const current = termRows.find((r) => r.id === id);
    if (!current) return;

    setTermSaving(true);
    setTermsErr(null);
    try {
      const payload = {
        id,
        term_name: termDraft.term_name ?? current.term_name,
        academic_year: termDraft.academic_year ?? current.academic_year,
        start_date: termDraft.start_date ?? current.start_date,
        end_date: termDraft.end_date ?? current.end_date,
        notes:
          termDraft.notes !== undefined ? termDraft.notes : current.notes,
      };

      const res = await fetch("/api/admin/la-term-dates", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `Save failed (${res.status})`);
      }

      // update local state
      setTermRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    term_name: payload.term_name,
                    academic_year: payload.academic_year,
                    start_date: payload.start_date,
                    end_date: payload.end_date,
                    notes: payload.notes,
                  }
                : r
            )
          : prev
      );
      setEditingTermId(null);
      setTermDraft({});
    } catch (e: any) {
      setTermsErr(e?.message || "Failed to save term");
    } finally {
      setTermSaving(false);
    }
  };

  const deleteTerm = async (id: string) => {
    if (!termRows) return;
    const row = termRows.find((r) => r.id === id);
    const label = row?.term_name || "this term";

    if (!window.confirm(`Remove ${label} for this LA?`)) return;

    setTermSaving(true);
    setTermsErr(null);
    try {
      const res = await fetch("/api/admin/la-term-dates", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `Delete failed (${res.status})`);
      }

      setTermRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      if (editingTermId === id) {
        setEditingTermId(null);
        setTermDraft({});
      }
    } catch (e: any) {
      setTermsErr(e?.message || "Failed to delete term");
    } finally {
      setTermSaving(false);
    }
  };

    useEffect(() => {
    let cancelled = false;
    if (!effectiveLaId) return;

    // Rates (org-aggregated)
    (async () => {
      try {
        setRatesLoading(true);
        setRatesErr(null);
        const j = await getJSON(
          `/api/admin/local-authorities/${encodeURIComponent(
            effectiveLaId
          )}/org-aggregates?section=rates`
        );
        const summary: RateSummary[] = j?.summary || [];
        if (!cancelled) setRates(summary);
      } catch (e: any) {
        if (!cancelled) setRatesErr(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setRatesLoading(false);
      }
    })();

    // Claim windows
    (async () => {
      try {
        setWindowsLoading(true);
        setWindowsErr(null);
        const j = await getJSON(
          `/api/admin/local-authorities/${encodeURIComponent(
            effectiveLaId
          )}/org-aggregates?section=claim_windows`
        );
        const summary: WindowSummary[] = j?.summary || [];
        if (!cancelled) setWindows(summary);
      } catch (e: any) {
        if (!cancelled) setWindowsErr(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setWindowsLoading(false);
      }
    })();

    // EXISTING TERM DATES (ADMIN ROUTE ONLY)
    (async () => {
      try {
        setTermsLoading(true);
        setTermsErr(null);
        const j = await getJSON(
          `/api/admin/la-term-dates?la_id=${encodeURIComponent(effectiveLaId)}`
        );
        const items: TermRow[] = j?.items || [];
        if (!cancelled) setTermRows(items);
      } catch (e: any) {
        if (!cancelled) {
          setTermsErr(e?.message || "Failed to load term dates");
        }
      } finally {
        if (!cancelled) setTermsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveLaId]);

  /** ---------- Render ---------- */
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{laName || "Local authority"}</h1>
        <p className="text-sm text-gray-600">
          Manage top links, term-dates crawling, funding summaries, and documents.
        </p>
      </header>

      {!effectiveLaId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Missing laId from parent loader – saves are disabled until the page passes an
          ID.
        </p>
      )}

      {/* Top links */}
      <section className="rounded-lg border p-4 bg-white">
        <div className="mb-3 font-semibold">Top links</div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs">
                Public site
              </span>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                placeholder="https://www.example.gov.uk"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">
                Provider portal
              </span>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                placeholder="https://portal.example.gov.uk"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onSaveLinks}
              disabled={!effectiveLaId || linksBusy}
              className="px-3 py-2 rounded bg-slate-800 text-white text-sm disabled:opacity-50"
            >
              {linksBusy ? "Saving…" : "Save links"}
            </button>
          </div>
        </div>
      </section>

            {/* Term dates source & candidates */}
      <section className="rounded-lg border p-4 bg-white space-y-4">
        <div className="font-semibold">Term dates — Source & candidates</div>

        {/* Source URL input */}
        <div>
          <label
            htmlFor="term-source-url"
            className="block text-sm font-medium text-gray-700"
          >
            Source URL (doc_type = "term_dates_source"; legacy reads "term_dates")
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="term-source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.gov.uk/schools/term-dates"
              className="flex-1 rounded-md border px-3 py-2 text-sm outline-none"
              disabled={crawlModeBusy === "apply" || saveBusy}
            />
            <button
              type="button"
              onClick={() => setSourceUrl("")}
              className="rounded-md border px-3 py-2 text-sm"
              disabled={crawlModeBusy === "apply" || saveBusy}
            >
              Clear
            </button>
          </div>
          {lastTestInfo && (
            <p className="mt-1 text-xs text-gray-500">Last test: {lastTestInfo}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTestUrl}
            disabled={!sourceUrl || testing}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {testing ? "Testing…" : "Test URL"}
          </button>
          <button
            type="button"
            onClick={onSaveSource}
            disabled={!effectiveLaId || !sourceUrl || saveBusy}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {saveBusy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onApproveSource}
            disabled={!effectiveLaId || !sourceUrl || approved || saveBusy}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {approved ? "Approved" : "Approve"}
          </button>
          <button
            type="button"
            onClick={onPreviewCrawl}
            disabled={!effectiveLaId || crawlModeBusy !== null}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {crawlModeBusy === "preview" ? "Previewing…" : "Preview crawl"}
          </button>
          <button
            type="button"
            onClick={onApplyCrawl}
            disabled={
              !effectiveLaId || !approved || !sourceUrl || crawlModeBusy !== null
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            {crawlModeBusy === "apply" ? "Applying…" : "Apply to table"}
          </button>
          <button
            type="button"
            onClick={onSuggestCandidates}
            disabled={!effectiveLaId || suggestBusy}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {suggestBusy ? "Searching…" : "Suggest candidates"}
          </button>
        </div>

        {/* Message */}
        {message && <p className="text-sm text-gray-700">{message}</p>}

        {/* Candidates */}
        <div className="border rounded-md p-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Candidates</h4>
            <span className="text-xs text-gray-500">
              Promote → approves + saves as source
            </span>
          </div>
          <ul className="mt-2 space-y-2">
            {candidates.length === 0 && (
              <li className="text-sm text-gray-500">No candidates.</li>
            )}
            {candidates.map((c) => (
              <li
                key={String(c.id ?? c.url)}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm">{c.title || c.url}</span>
                <div className="flex gap-2">
                  <a
                    href={c.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border px-2 py-1 text-xs"
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => onPromoteCandidate(c)}
                    className="rounded-md border px-2 py-1 text-xs"
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCandidate(c)}
                    className="rounded-md border px-2 py-1 text-xs"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Preview results (in-memory only) */}
        {previewRows && (
          <div className="border rounded-md p-3">
            <h4 className="font-medium mb-2">Preview results</h4>
            {previewRows.length === 0 ? (
              <p className="text-sm text-gray-500">No rows found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 border-b">Term</th>
                      <th className="text-left p-2 border-b">Start</th>
                      <th className="text-left p-2 border-b">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.term_name || "Term"}</td>
                        <td className="p-2">{r.start}</td>
                        <td className="p-2">{r.end}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Existing term dates (from la_term_dates) */}
                {/* Existing term dates (from la_term_dates) */}
        <div className="border rounded-md p-3">
          <h4 className="font-medium mb-2">Existing term dates (table)</h4>

          {termsLoading && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}

          {termsErr && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {termsErr}
            </p>
          )}

          {!termsLoading && !termsErr && (!termRows || termRows.length === 0) ? (
            <p className="text-sm text-gray-500">
              No term dates have been imported/applied for this local authority yet.
            </p>
          ) : null}

          {termRows && termRows.length > 0 && !termsLoading && !termsErr && (
            <div className="overflow-x-auto mt-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border-b">Term</th>
                    <th className="text-left p-2 border-b">Academic year</th>
                    <th className="text-left p-2 border-b">Start</th>
                    <th className="text-left p-2 border-b">End</th>
                    <th className="text-left p-2 border-b">Notes</th>
                    <th className="text-left p-2 border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {termRows.map((r) => {
                    const isEditing = editingTermId === r.id;
                    const startValue =
                      (isEditing
                        ? termDraft.start_date
                        : r.start_date?.slice(0, 10)) || "";
                    const endValue =
                      (isEditing
                        ? termDraft.end_date
                        : r.end_date?.slice(0, 10)) || "";

                    return (
                      <tr key={r.id} className="border-t align-top">
                        {/* Term name */}
                        <td className="p-2">
                          {isEditing ? (
                            <input
                              type="text"
                              className="w-full rounded border px-2 py-1 text-xs"
                              value={
                                termDraft.term_name ?? r.term_name ?? ""
                              }
                              onChange={(e) =>
                                updateDraftField("term_name", e.target.value)
                              }
                            />
                          ) : (
                            r.term_name
                          )}
                        </td>

                        {/* Academic year */}
                        <td className="p-2">
                          {isEditing ? (
                            <input
                              type="text"
                              className="w-full rounded border px-2 py-1 text-xs"
                              placeholder="2025/26"
                              value={
                                termDraft.academic_year ??
                                r.academic_year ??
                                ""
                              }
                              onChange={(e) =>
                                updateDraftField("academic_year", e.target.value)
                              }
                            />
                          ) : (
                            r.academic_year || "—"
                          )}
                        </td>

                        {/* Start date */}
                        <td className="p-2">
                          {isEditing ? (
                            <input
                              type="date"
                              className="rounded border px-2 py-1 text-xs"
                              value={startValue}
                              onChange={(e) =>
                                updateDraftField(
                                  "start_date",
                                  e.target.value || null
                                )
                              }
                            />
                          ) : r.start_date ? (
                            new Date(r.start_date).toLocaleDateString(
                              "en-GB",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* End date */}
                        <td className="p-2">
                          {isEditing ? (
                            <input
                              type="date"
                              className="rounded border px-2 py-1 text-xs"
                              value={endValue}
                              onChange={(e) =>
                                updateDraftField(
                                  "end_date",
                                  e.target.value || null
                                )
                              }
                            />
                          ) : r.end_date ? (
                            new Date(r.end_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Notes */}
                        <td className="p-2">
                          {isEditing ? (
                            <textarea
                              className="w-full rounded border px-2 py-1 text-xs"
                              rows={2}
                              value={termDraft.notes ?? r.notes ?? ""}
                              onChange={(e) =>
                                updateDraftField("notes", e.target.value)
                              }
                            />
                          ) : (
                            r.notes || "—"
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-2">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                disabled={termSaving}
                                onClick={() => saveEditTerm(r.id)}
                              >
                                {termSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs"
                                disabled={termSaving}
                                onClick={cancelEditTerm}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs"
                                onClick={() => startEditTerm(r)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700"
                                disabled={termSaving}
                                onClick={() => deleteTerm(r.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Funding summaries */}
      <section className="rounded-lg border p-4 bg-white space-y-4">
        <div className="font-semibold">Org-entered funding rates (summary)</div>
        {ratesLoading && <div className="text-sm">Loading…</div>}
        {ratesErr && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {ratesErr}
          </div>
        )}
        {!ratesLoading && !ratesErr && (!rates || rates.length === 0) ? (
          <div className="text-sm text-gray-600">
            No org-entered rates found for this LA yet.
          </div>
        ) : null}
        {rates && rates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b">Entitlement</th>
                  <th className="text-left p-2 border-b">Hours</th>
                  <th className="text-left p-2 border-b">Rate (£/hr)</th>
                  <th className="text-left p-2 border-b">Organisations</th>
                  <th className="text-left p-2 border-b">Share</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((ent) =>
                  ent.rows.length ? (
                    ent.rows.map((r, idx) => (
                      <tr key={`${ent.entitlement_id}-${r.rate_hour}-${idx}`} className="border-t">
                        <td className="p-2">
                          {idx === 0 ? (
                            <strong>
                              {ent.entitlement_code ||
                                ent.entitlement_name ||
                                ent.entitlement_id}
                            </strong>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="p-2">{idx === 0 ? ent.hours_per_week ?? "—" : ""}</td>
                        <td className="p-2">£{r.rate_hour.toFixed(2)}</td>
                        <td className="p-2">{r.org_count}</td>
                        <td className="p-2">
                          {ent.total_orgs ? `${Math.round(r.share * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr key={`${ent.entitlement_id}-empty`} className="border-t">
                      <td className="p-2">
                        <strong>
                          {ent.entitlement_code ||
                            ent.entitlement_name ||
                            ent.entitlement_id}
                        </strong>
                      </td>
                      <td className="p-2">{ent.hours_per_week ?? "—"}</td>
                      <td className="p-2" colSpan={3}>
                        <span className="text-gray-600">No rates yet.</span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="font-semibold pt-2">Org-entered claim windows (summary)</div>
        {windowsLoading && <div className="text-sm">Loading…</div>}
        {windowsErr && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {windowsErr}
          </div>
        )}
        {!windowsLoading && !windowsErr && (!windows || windows.length === 0) ? (
          <div className="text-sm text-gray-600">
            No org-entered claim windows found for this LA yet.
          </div>
        ) : null}
        {windows && windows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b">Period</th>
                  <th className="text-left p-2 border-b">Opens (range)</th>
                  <th className="text-left p-2 border-b">Closes (range)</th>
                  <th className="text-left p-2 border-b">Window length (days)</th>
                  <th className="text-left p-2 border-b">Organisations</th>
                  <th className="text-left p-2 border-b">Share</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((p) =>
                  p.rows.length ? (
                    p.rows.map((r, idx) => (
                      <tr key={`${p.period_code}-${r.duration_days}-${idx}`} className="border-t">
                        <td className="p-2">{idx === 0 ? <strong>{p.period_code}</strong> : ""}</td>
                        <td className="p-2">
                          {idx === 0
                            ? `${fmtShort(p.min_opens)} – ${fmtShort(p.max_opens)}`
                            : ""}
                        </td>
                        <td className="p-2">
                          {idx === 0
                            ? `${fmtShort(p.min_closes)} – ${fmtShort(p.max_closes)}`
                            : ""}
                        </td>
                        <td className="p-2">{r.duration_days}</td>
                        <td className="p-2">{r.org_count}</td>
                        <td className="p-2">
                          {p.total_orgs ? `${Math.round(r.share * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr key={`${p.period_code}-empty`} className="border-t">
                      <td className="p-2">
                        <strong>{p.period_code}</strong>
                      </td>
                      <td className="p-2">{`${fmtShort(p.min_opens)} – ${fmtShort(
                        p.max_opens
                      )}`}</td>
                      <td className="p-2">{`${fmtShort(p.min_closes)} – ${fmtShort(
                        p.max_closes
                      )}`}</td>
                      <td className="p-2" colSpan={3}>
                        <span className="text-gray-600">No windows yet.</span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documents (editable) */}
      <section className="rounded-lg border p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Documents</div>
          <button onClick={addDocDraft} className="btn">
            + Add document
          </button>
        </div>

        {docMsg && <div className="text-sm text-slate-700">{docMsg}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b">Type</th>
                <th className="text-left p-2 border-b">Title</th>
                <th className="text-left p-2 border-b">Version</th>
                <th className="text-left p-2 border-b">Effective from</th>
                <th className="text-left p-2 border-b">URL</th>
                <th className="text-left p-2 border-b">Notes</th>
                <th className="text-left p-2 border-b"></th>
              </tr>
            </thead>
            <tbody>
              {docRows.length ? (
                docRows.map((d, i) => {
                  const isEdit = !!docEditing[String(d.id)];
                  return (
                    <tr key={String(d.id)} className="border-t">
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            value={d.doc_type}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, doc_type: e.target.value } : x))
                              )
                            }
                          />
                        ) : (
                          d.doc_type
                        )}
                      </td>
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            value={d.title || ""}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x))
                              )
                            }
                          />
                        ) : (
                          d.title
                        )}
                      </td>
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            value={d.version || ""}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, version: e.target.value } : x))
                              )
                            }
                          />
                        ) : (
                          d.version ?? "—"
                        )}
                      </td>
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            type="date"
                            value={dateInput(d.effective_from || "")}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) =>
                                  j === i ? { ...x, effective_from: e.target.value } : x
                                )
                              )
                            }
                          />
                        ) : d.effective_from ? (
                          date(d.effective_from)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            value={d.url || ""}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x))
                              )
                            }
                          />
                        ) : d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" className="underline">
                            open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        {isEdit ? (
                          <input
                            value={d.notes || ""}
                            onChange={(e) =>
                              setDocRows((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x))
                              )
                            }
                          />
                        ) : (
                          d.notes ?? "—"
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {isEdit ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => saveDoc(i)} className="btn">
                              Save
                            </button>
                            <button
                              onClick={() => toggleDocEdit(String(d.id), false)}
                              className="btn"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => toggleDocEdit(String(d.id), true)}
                              className="btn"
                            >
                              Edit
                            </button>
                            <button onClick={() => deleteDoc(i)} className="btn">
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="p-2 text-gray-600" colSpan={7}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tiny global styles for inputs/buttons (keeps visuals lightweight) */}
      <style jsx global>{`
        input {
          border: 1px solid #d0d5dd;
          border-radius: 8px;
          padding: 6px 8px;
        }
        button {
          transition: opacity 0.15s ease;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn {
          padding: 8px 12px;
          border: 1px solid #d0d5dd;
          border-radius: 8px;
          background: #f2f4f7;
          color: #101828;
          font-weight: 600;
          line-height: 1.2;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.05);
        }
        .btn:hover {
          background: #e4e7ec;
          border-color: #c4cacf;
        }
      `}</style>
    </div>
  );

  /** ---- local helpers (dates) ---- */
  function date(iso?: string | null) {
    return iso ? new Date(iso).toLocaleDateString("en-GB") : "—";
  }
  function dateInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function fmtShort(iso?: string | null) {
    return iso
      ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : "—";
  }
}

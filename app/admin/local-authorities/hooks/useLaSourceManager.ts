"use client";

import * as React from "react";

/** Minimal Doc shape this hook works with */
export interface Doc {
  id?: string | number | null;
  doc_type: string;
  title?: string | null;
  url?: string | null;
  version?: string | null;
  effective_from?: string | null;
  notes?: string | null;
}

type CrawlPreviewResult<TPreview> = {
  mode: "preview";
  found?: TPreview[];
  confidence?: number;
  error?: string;
};

type CrawlApplyResult = {
  mode: "apply";
  upserted: number;
  skipped: number;
  error?: string;
};

export type CrawlResult<TPreview> = CrawlPreviewResult<TPreview> | CrawlApplyResult;

export type LaSourceApi<TPreview> = {
  /** Your existing function (or wrapper) that calls the crawl endpoint */
  crawlSection: (
    laId: string,
    section: string,
    url?: string,
    apply?: boolean
  ) => Promise<CrawlResult<TPreview>>;

  /** Your existing data-writer utility (e.g., server action / API) */
  saveRow: (laId: string, table: "documents", row: Partial<Doc>) => Promise<void>;

  /** Your existing data-writer utility (e.g., server action / API) */
  deleteRow: (laId: string, table: "documents", where: { id: string | number }) => Promise<void>;

  /** POST /api/admin/local-authorities/probe (or your wrapper) */
  probe: (url: string) => Promise<{ http_status?: number; content_type?: string }>;

  /** POST /api/admin/local-authorities/suggest (or your wrapper) */
  suggest: (laId: string, section: string, max: number) => Promise<Doc[]>;
};

export type LaSourceConfig = {
  /** UI label, e.g. "Term dates" */
  label: string;

  /** Section key you pass to your crawler, e.g. "term_dates" */
  section: string;

  /**
   * The canonical/approved doc_type you write to (e.g. "term_dates_source").
   * This is what you save/approve against.
   */
  chosenDocType: string;

  /**
   * When looking for an initial URL and approval we check any of these types,
   * e.g. ["term_dates_source", "term_dates"].
   */
  docTypeCandidates: string[];

  /**
   * Candidate rows suggested/detected (not yet approved),
   * e.g. ["term_dates_candidate"].
   */
  candidateDocTypes: string[];

  /** Optional: max batch returned by suggest() */
  suggestMax?: number;
};

function lc(s: string | null | undefined) {
  return (s ?? "").toLowerCase();
}

function initialUrlFromDocs(docs: Doc[], types: string[]) {
  // Prefer an approved-looking row first, then any with a URL in order.
  const approvedRow =
    docs.find(d => types.includes(d.doc_type) && /approved\b/.test(lc(d.notes))) ??
    docs.find(d => types.includes(d.doc_type) && d.url);
  return (approvedRow?.url ?? "").toString();
}

function isApproved(docs: Doc[], types: string[]) {
  return docs.some(d => types.includes(d.doc_type) && /approved\b/.test(lc(d.notes)));
}

function initialCandidates(docs: Doc[], candidateTypes: string[]) {
  return docs.filter(d => candidateTypes.includes(d.doc_type));
}

function dedupeByIdOrUrl(items: Doc[]) {
  const seen = new Set<string>();
  const out: Doc[] = [];
  for (const d of items) {
    const key = d.id != null ? `id:${String(d.id)}` : `url:${d.url ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

export function useLaSourceManager<TPreview = unknown>(params: {
  laId: string;
  documents: Doc[];
  api: LaSourceApi<TPreview>;
  config: LaSourceConfig;
}) {
  const { laId, documents, api, config } = params;
  const {
    label,
    section,
    chosenDocType,
    docTypeCandidates,
    candidateDocTypes,
    suggestMax = 6,
  } = config;

  // Derivations from docs (and re-derive whenever docs change)
  const [url, setUrl] = React.useState<string>(
    initialUrlFromDocs(documents, docTypeCandidates)
  );
  const [approved, setApproved] = React.useState<boolean>(
    isApproved(documents, docTypeCandidates)
  );
  const [localCandidates, setLocalCandidates] = React.useState<Doc[]>(
    initialCandidates(documents, candidateDocTypes)
  );
  const [showCandidates, setShowCandidates] = React.useState<boolean>(false);

  // UI state
  const [saving, setSaving] = React.useState(false);
  const [crawlBusy, setCrawlBusy] = React.useState<"preview" | "apply" | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [suggestBusy, setSuggestBusy] = React.useState(false);

  const [message, setMessage] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TPreview[] | null>(null);
  const [lastTest, setLastTest] = React.useState<string | null>(null);

  // If documents refresh after an action, keep UI in sync.
  React.useEffect(() => {
    setUrl(initialUrlFromDocs(documents, docTypeCandidates));
    setApproved(isApproved(documents, docTypeCandidates));
    setLocalCandidates(initialCandidates(documents, candidateDocTypes));
  }, [documents, docTypeCandidates, candidateDocTypes]);

  const existing = React.useMemo(
    () =>
      documents.find(d => d.doc_type === chosenDocType) ??
      documents.find(d => docTypeCandidates.includes(d.doc_type)),
    [documents, chosenDocType, docTypeCandidates]
  );

  async function testUrl() {
    setTesting(true);
    setMessage(null);
    setLastTest(null);
    try {
      if (!url.trim()) throw new Error("Please enter a source URL.");
      const r = await api.probe(url);
      const info = `HTTP ${r.http_status ?? "—"}${r.content_type ? ` · ${r.content_type}` : ""}`;
      setLastTest(info);
      setMessage(`Test OK (${info})`);
    } catch (e: any) {
      setLastTest(null);
      setMessage(e?.message || "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function saveSource() {
    setSaving(true);
    setMessage(null);
    try {
      if (!url.trim()) throw new Error("Please enter a source URL.");
      await api.saveRow(laId, "documents", {
        id: existing?.id ?? undefined,
        doc_type: chosenDocType,
        title: `Source: ${label}`,
        url,
        version: existing?.version ?? null,
        effective_from: existing?.effective_from ?? null,
        notes: approved
          ? `approved ${new Date().toISOString().slice(0, 10)}`
          : existing?.notes ?? null,
      });
      setMessage("Source saved.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to save source.");
    } finally {
      setSaving(false);
    }
  }

  async function approveUrl() {
    setSaving(true);
    setMessage(null);
    try {
      if (!url.trim()) throw new Error("Please enter a source URL.");
      await api.saveRow(laId, "documents", {
        id: existing?.id ?? undefined,
        doc_type: chosenDocType,
        title: `Source: ${label}`,
        url,
        version: existing?.version ?? null,
        effective_from: existing?.effective_from ?? null,
        notes: `approved ${new Date().toISOString().slice(0, 10)}`,
      });
      setApproved(true);
      setMessage("Source approved.");
    } catch (e: any) {
      setMessage(e?.message || "Approve failed.");
    } finally {
      setSaving(false);
    }
  }

  async function doPreview() {
    setCrawlBusy("preview");
    setMessage(null);
    setPreview(null);
    try {
      const res = await api.crawlSection(laId, section, url || undefined, false);
      if ("error" in res && res.error) throw new Error(res.error);
      if (res.mode === "preview") {
        setPreview(res.found || []);
        setMessage(
          `Preview: found ${res.found?.length ?? 0} rows${
            typeof (res as any).confidence === "number"
              ? ` (confidence ${Math.round(((res as any).confidence || 0) * 100)}%).`
              : "."
          }`
        );
      } else {
        setMessage("Unexpected response (apply result during preview).");
      }
    } catch (e: any) {
      setMessage(e?.message || "Preview failed.");
    } finally {
      setCrawlBusy(null);
    }
  }

  async function doApply() {
    setCrawlBusy("apply");
    setMessage(null);
    try {
      if (!approved) throw new Error("Please approve the source URL before applying.");
      if (!url.trim()) throw new Error("Approved URL is empty; save or approve a URL first.");
      const res = await api.crawlSection(laId, section, url, true);
      if ("error" in res && res.error) throw new Error(res.error);
      if (res.mode === "apply") {
        setMessage(`Applied: upserted ${res.upserted}, skipped ${res.skipped}.`);
      } else {
        setMessage("Unexpected response (preview result during apply).");
      }
    } catch (e: any) {
      setMessage(e?.message || "Apply failed.");
    } finally {
      setCrawlBusy(null);
    }
  }

  async function suggestCandidates() {
    setSuggestBusy(true);
    setMessage(null);
    try {
      const got = await api.suggest(laId, section, suggestMax);
      if (got?.length) {
        setLocalCandidates(prev => dedupeByIdOrUrl([...prev, ...got]));
        setShowCandidates(true);
        setMessage(`Added ${got.length} candidate${got.length === 1 ? "" : "s"}.`);
      } else {
        setMessage("No candidates found (set Public site / Portal above and try again).");
      }
    } catch (e: any) {
      setMessage(e?.message || "Suggest failed.");
    } finally {
      setSuggestBusy(false);
    }
  }

  async function promoteCandidate(cand: Doc) {
    setSaving(true);
    setMessage(null);
    try {
      await api.saveRow(laId, "documents", {
        doc_type: chosenDocType,
        title: `Source: ${label}`,
        url: cand.url ?? null,
        notes: `approved ${new Date().toISOString().slice(0, 10)}`,
      });
      if (cand.id != null) {
        setLocalCandidates(cs => cs.filter(c => c.id !== cand.id));
      }
      setApproved(true);
      setMessage("Candidate promoted to approved source.");
    } catch (e: any) {
      setMessage(e?.message || "Promote failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCandidate(cand: Doc) {
    setSaving(true);
    setMessage(null);
    try {
      if (cand.id != null) await api.deleteRow(laId, "documents", { id: cand.id });
      setLocalCandidates(cs => cs.filter(c => c.id !== cand.id));
      setMessage("Candidate removed.");
    } catch (e: any) {
      setMessage(e?.message || "Remove failed.");
    } finally {
      setSaving(false);
    }
  }

  return {
    // state
    url,
    approved,
    localCandidates,
    showCandidates,
    saving,
    crawlBusy,
    testing,
    suggestBusy,
    message,
    preview,
    lastTest,

    // setters
    setUrl,
    setShowCandidates,

    // actions
    testUrl,
    saveSource,
    approveUrl,
    doPreview,
    doApply,
    suggestCandidates,
    promoteCandidate,
    deleteCandidate,
  };
}

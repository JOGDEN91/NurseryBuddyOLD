// app/parent/children/[id]/ChildDocumentsCard.tsx
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";

type DocStatus = "missing" | "requested" | "pending" | "verified" | "review";

type DocsMap = Record<
  string,
  {
    status: DocStatus;
    updated_at?: string | null;
  }
>;

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  docs: DocsMap;
};

type ApiPayload = {
  children: ChildRow[];
  types: { label: string }[];
};

function pillColors(status?: string) {
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

function StatusPill({ status }: { status?: string }) {
  const { bg, fg, br } = pillColors(status);
  const label = status === "review" ? "review requested" : status || "missing";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${br}`,
        fontWeight: 600,
        fontSize: 12,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

// Only these labels support expiry (match your document type labels, case-insensitive)
const EXPIRY_LABELS = new Set([
  "proof of address",
  "proof of id",
  "id",
]);

export function ChildDocumentsCard({
  childId,
  childName,
  nurseryId,
}: {
  childId: string;
  childName: string;
  nurseryId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocsMap>({});
  const [error, setError] = useState<string | null>(null);

  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState<string>("");

  // Fetch the same data staff see, then filter to this child
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!nurseryId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/documents/table", window.location.origin);
        url.searchParams.set("nursery_id", nurseryId);
        const res = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const js = (await res.json()) as ApiPayload;
        if (!res.ok) throw new Error((js as any)?.error || "Failed to load");
        if (cancel) return;

        const row = js.children.find((c) => c.id === childId);
        setDocs((row?.docs as DocsMap) || {});
        setTypes(js.types.map((t) => t.label));
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Failed to load documents");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [childId, nurseryId]);

  async function handleUpload(file: File, label: string) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("label", label);

      // Only send expiry for allowed labels
      const allowExpiry = EXPIRY_LABELS.has(label.toLowerCase());
      if (allowExpiry && expiryDraft) {
        form.append("expiry_date", expiryDraft);
      }

      const res = await fetch(`/api/parent/children/${childId}/documents`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: form,
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok || js?.ok === false) {
        throw new Error(js?.error || `Upload failed (${res.status})`);
      }

      // Optimistic refresh: mark this label as pending
      setDocs((cur) => ({
        ...cur,
        [label]: {
          ...(cur[label] || {}),
          status: "pending",
          updated_at: new Date().toISOString(),
        },
      }));
      setExpiryDraft("");
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadLabel(null);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  const orderedTypes = useMemo(() => types, [types]);

  if (!nurseryId) return null;

  // UI: only show expiry picker when the currently selected label supports expiry
  const expiryAllowed =
    uploadLabel && EXPIRY_LABELS.has(uploadLabel.toLowerCase());

  return (
    <div className="mt-1 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Documents</h2>
        <span className="text-xs text-gray-500">
          Upload documents for <span className="font-medium">{childName}</span>
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-sm text-gray-500">Loading…</div>
      ) : orderedTypes.length === 0 ? (
        <div className="mt-3 text-sm text-gray-500">
          No document types configured for this nursery yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {orderedTypes.map((label) => {
            const entry = docs[label] || { status: "missing" as DocStatus };
            const updated =
              entry.updated_at &&
              new Date(entry.updated_at).toLocaleString("en-GB");

            const canUpload =
              entry.status === "missing" ||
              entry.status === "requested" ||
              entry.status === "review" ||
              entry.status === "pending";

            return (
              <div
                key={label}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {label}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <StatusPill status={entry.status} />
                    {updated && <span>Updated {updated}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {canUpload && (
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                      disabled={uploading && uploadLabel === label}
                      onClick={() => {
                        setUploadLabel(label);
                        // don't reset expiryDraft here so user can set it first if they want
                        setTimeout(() => fileRef.current?.click(), 0);
                      }}
                    >
                      {entry.status === "missing" ? "Upload" : "Replace"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file input shared across rows */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f || !uploadLabel) return;
          handleUpload(f, uploadLabel);
        }}
      />

      {/* Expiry field (only for specific doc types) */}
      {expiryAllowed && (
        <div className="mt-3 border-t pt-3">
          <label className="block text-xs font-semibold text-gray-700">
            Expiry date (optional, applies to the next "{uploadLabel}" upload)
          </label>
          <input
            type="date"
            value={expiryDraft}
            onChange={(e) => setExpiryDraft(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Only proof of ID and proof of address should have an expiry date. Birth
            certificate and funding code letters do not expire.
          </p>
        </div>
      )}

      {/* Audit trail link (same data the staff page sees) */}
      <div className="mt-3 flex justify-end">
        <a
          href={`/api/documents/audit?child_id=${encodeURIComponent(childId)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-gray-500 underline"
        >
          View full audit trail
        </a>
      </div>
    </div>
  );
}

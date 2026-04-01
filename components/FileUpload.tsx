"use client";

import { useEffect, useState } from "react";

type ChildRow = { id: string; child_name: string; date_of_birth: string };

const DOC_TYPES = [
  "Birth certificate",
  "Proof of address",
  "ID document",
  "Funding code letter",
  "Other",
];

export default function FileUpload({
  defaultChildId = "",
  defaultDocType = "",
  onUploaded,
}: {
  defaultChildId?: string;
  defaultDocType?: string;
  onUploaded?: (fileRow: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childId, setChildId] = useState<string>(defaultChildId);
  const [docType, setDocType] = useState<string>(defaultDocType);

  useEffect(() => {
    // load parent's children for the dropdown
    (async () => {
      try {
        const res = await fetch("/api/children");
        const body = await res.json();
        if (res.ok) setChildren(body.items || []);
      } catch {
        /* noop */
      }
    })();
  }, []);

  async function onUpload() {
    if (!file) return;
    setStatus("uploading");
    setError(null);

    try {
      const supabase = (await import("@/lib/supabase/client")).supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthenticated");

      const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;
      const bucket = "nf-uploads";

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;

      // record metadata (+ child + doc_type)
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          bucket,
          mime_type: file.type || null,
          bytes: file.size || null,
          label: file.name,
          child_id: childId || null,
          doc_type: docType || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to save file record");

      setStatus("done");
      setFile(null);
      // Only clear if these weren't provided as defaults
      if (!defaultChildId) setChildId("");
      if (!defaultDocType) setDocType("");

      // notify parent (e.g. to link request → file and set status=submitted)
      onUploaded?.(body.item);

      // refresh lists
      (await import("next/navigation")).useRouter().refresh?.();
    } catch (e: any) {
      setStatus("error");
      setError(e.message || "Upload failed");
    }
  }

  return (
    <div
      style={{
        border: "1px dashed #d1d5db",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 8,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Upload a document</h3>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Child (optional)</span>
        <select
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="">— None —</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.child_name} (DOB {c.date_of_birth})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Document type (optional)</span>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <option value="">— Select —</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          disabled={!file || status === "uploading"}
          onClick={onUpload}
          style={{ padding: "8px 12px", borderRadius: 8, background: "black", color: "white" }}
        >
          {status === "uploading" ? "Uploading…" : "Upload"}
        </button>
        {status === "done" && <span>Uploaded ✅</span>}
        {status === "error" && <span style={{ color: "red" }}>{error}</span>}
      </div>
    </div>
  );
}
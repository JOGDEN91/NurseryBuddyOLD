// app/org/declarations/print/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Child = { id: string; first_name: string | null; last_name: string | null };
type DocSummary = { label: string; status: string };
type DeclarationItem = {
  id: string;
  status: string;
  signed_at: string | null;
  signed_by_name: string | null;
  child: Child;
  term_id: string;
  docs?: DocSummary[];
};

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString("en-GB");
}

export default function DeclarationsPrintPage() {
  const sp = useSearchParams();

  const nurseryId = sp.get("nursery_id") || "";
  const termId = sp.get("term_id") || "";
  const openId = sp.get("open") || "";
  const autoPrint = sp.get("autoprint") === "1";

  const [items, setItems] = useState<DeclarationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nurseryId || !termId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        params.set("term_id", termId);
        const res = await fetch(`/api/org/declarations?${params.toString()}`, { credentials: "include", cache: "no-store" });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        setItems(Array.isArray(j?.items) ? j.items : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [nurseryId, termId]);

  const filtered = useMemo(() => {
    if (!openId) return items;
    return items.filter((d) => d.id === openId);
  }, [items, openId]);

  useEffect(() => {
    if (!autoPrint) return;
    if (loading) return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, [autoPrint, loading]);

  return (
    <div style={{ padding: 20, fontFamily: "ui-sans-serif, system-ui" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        h1 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
        h2 { font-size: 14px; font-weight: 800; margin: 16px 0 6px; }
        .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
        .label { font-size: 12px; color: #6b7280; }
        .value { font-size: 13px; font-weight: 700; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => window.print()} style={{ border: "1px solid #D1D5DB", borderRadius: 8, padding: "6px 10px", background: "#fff", fontWeight: 700 }}>
          Print / Save as PDF
        </button>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Tip: In the print dialog, choose “Save as PDF” to download.
        </div>
      </div>

      <h1>{openId ? "Declaration" : "Declarations – Bulk Print"}</h1>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No declarations found.</div>
      ) : (
        filtered.map((d) => {
          const name = `${d.child.first_name ?? ""} ${d.child.last_name ?? ""}`.trim() || "Unnamed child";
          return (
            <div key={d.id} className="card">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Child</div>
                  <div className="value">{name}</div>
                </div>
                <div>
                  <div className="label">Status</div>
                  <div className="value">{d.status}</div>
                </div>
                <div>
                  <div className="label">Signed at</div>
                  <div className="value">{fmtDateTime(d.signed_at)}</div>
                </div>
                <div>
                  <div className="label">Signed by</div>
                  <div className="value">{d.signed_by_name || "—"}</div>
                </div>
              </div>

              <h2>Documents</h2>
              <div style={{ fontSize: 12 }}>
                {(d.docs ?? []).length === 0 ? (
                  <div style={{ color: "#6b7280" }}>No document summary available.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {(d.docs ?? []).map((x, idx) => (
                      <li key={idx}>
                        {x.label}: <b>{x.status}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChildLite = {
  id: string;
  name: string;
  start_date: string | null;
};

type DocRow = { label: string; status: string };

type Props = {
  nurseryId: string;
  termBlockIds: string[]; // LA term ids (Term 1..6)
  children: ChildLite[];
};

type DocCounts = { green: number; amber: number; red: number; total: number };

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB");
}

function classifyDoc(statusRaw: any): "green" | "amber" | "red" | "ignore" {
  const s = String(statusRaw ?? "").toLowerCase().trim();
  if (!s) return "amber";
  if (s === "verified") return "green";
  if (s === "pending" || s === "requested" || s === "review") return "amber";
  return "red";
}

function classifyDecl(statusRaw: any): "signed" | "pending" | "other" {
  const s = String(statusRaw ?? "").toLowerCase().trim();
  if (s === "signed" || s === "approved") return "signed";
  if (s === "pending" || s === "sent" || s === "review" || s === "pending_review")
    return "pending";
  return "other";
}

function ProgressBar({ counts }: { counts: DocCounts }) {
  const C_BG = "#E5E7EB";
  const C_GREEN = "#4CAF78";
  const C_AMBER = "#F08A00";
  const C_RED = "#B91C1C";

  const { total } = counts;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const segments = [
    { key: "green", color: C_GREEN, pct: pct(counts.green) },
    { key: "amber", color: C_AMBER, pct: pct(counts.amber) },
    { key: "red", color: C_RED, pct: pct(counts.red) },
  ].filter((s) => s.pct > 0.01);

  return (
    <div
      style={{
        width: 120,
        height: 6,
        borderRadius: 999,
        background: C_BG,
        overflow: "hidden",
      }}
      title={
        total === 0
          ? "No documents yet"
          : `Verified: ${counts.green}, Pending: ${counts.amber}, Missing/Issue: ${counts.red}`
      }
    >
      {total > 0 && (
        <div style={{ display: "flex", height: "100%" }}>
          {segments.map((s) => (
            <div key={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeclPill({ status }: { status: "not_generated" | "pending" | "signed" | "attention" }) {
  const styleMap: Record<string, { bg: string; br: string; fg: string; text: string }> = {
    signed: { bg: "#E6F5EE", br: "#C9ECD9", fg: "#1F7A55", text: "Signed" },
    pending: { bg: "#FFF6E5", br: "#FFE7BF", fg: "#8A5A00", text: "Pending" },
    not_generated: { bg: "#F3F4F6", br: "#E5E7EB", fg: "#374151", text: "Not generated" },
    attention: { bg: "#FBEAEA", br: "#F3C5C5", fg: "#8A1F1F", text: "Attention" },
  };

  const m = styleMap[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${m.br}`,
        background: m.bg,
        color: m.fg,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {m.text}
    </span>
  );
}

export default function StartingChildrenStatusTableClient({
  nurseryId,
  termBlockIds,
  children,
}: Props) {
  const ids = useMemo(() => (termBlockIds ?? []).filter(Boolean), [termBlockIds]);

  const [docCountsByChild, setDocCountsByChild] = useState<Record<string, DocCounts>>({});
  const [declStatusByChild, setDeclStatusByChild] = useState<
    Record<string, "not_generated" | "pending" | "signed" | "attention">
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nurseryId || children.length === 0) {
      setDocCountsByChild({});
      setDeclStatusByChild({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setLoading(true);

      try {
        // 1) Declarations: fetch once per term block and build a child->status map
        const statusBuckets: Record<string, Array<"signed" | "pending" | "other">> = {};

        if (ids.length > 0) {
          const declLists = await Promise.all(
            ids.map(async (termId) => {
              const params = new URLSearchParams();
              params.set("nursery_id", nurseryId);
              params.set("term_id", termId);
              const res = await fetch(`/api/org/declarations?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
                credentials: "include",
              });
              const j = await res.json().catch(() => ({} as any));
              if (!res.ok || j.ok === false) return [];
              return Array.isArray(j.items) ? j.items : [];
            })
          );

          for (const list of declLists.flat() as any[]) {
            const childId = list?.child?.id ?? list?.child_id ?? null;
            if (!childId) continue;
            const bucket = classifyDecl(list?.status);
            statusBuckets[childId] = statusBuckets[childId] ?? [];
            statusBuckets[childId].push(bucket);
          }
        }

        const declFinal: Record<string, "not_generated" | "pending" | "signed" | "attention"> = {};
        for (const c of children) {
          const arr = statusBuckets[c.id] ?? [];
          if (arr.length === 0) declFinal[c.id] = "not_generated";
          else if (arr.every((x) => x === "signed")) declFinal[c.id] = "signed";
          else if (arr.some((x) => x === "pending")) declFinal[c.id] = "pending";
          else declFinal[c.id] = "attention";
        }

        // 2) Documents: fetch per child using the existing endpoint
        const docsFinal: Record<string, DocCounts> = {};

        await Promise.all(
          children.map(async (c) => {
            try {
              const res = await fetch(
                `/api/parent/children/${encodeURIComponent(c.id)}/documents`,
                { method: "GET", cache: "no-store", credentials: "include" }
              );
              const j = await res.json().catch(() => ({} as any));
              const items: DocRow[] = Array.isArray(j.items) ? j.items : [];
              let green = 0,
                amber = 0,
                red = 0;

              for (const it of items) {
                const bucket = classifyDoc(it.status);
                if (bucket === "green") green += 1;
                else if (bucket === "amber") amber += 1;
                else if (bucket === "red") red += 1;
              }

              docsFinal[c.id] = { green, amber, red, total: green + amber + red };
            } catch {
              docsFinal[c.id] = { green: 0, amber: 0, red: 0, total: 0 };
            }
          })
        );

        if (!cancelled) {
          setDeclStatusByChild(declFinal);
          setDocCountsByChild(docsFinal);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, ids, children]);

  if (children.length === 0) {
    return <div style={{ fontSize: 13, opacity: 0.7 }}>None.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {loading && (
        <div style={{ fontSize: 12, opacity: 0.65 }}>Loading status…</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #EEE" }}>
              <th style={{ padding: "8px 6px" }}>Child</th>
              <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>Start date</th>
              <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>Documents</th>
              <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>Declaration</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => {
              const docCounts = docCountsByChild[c.id] ?? { green: 0, amber: 0, red: 0, total: 0 };
              const decl = declStatusByChild[c.id] ?? "not_generated";

              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #F2F1EE" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "8px 6px", opacity: 0.8 }}>{fmtDate(c.start_date)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <ProgressBar counts={docCounts} />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <DeclPill status={decl} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
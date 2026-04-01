"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  nurseryId: string;
  termBlockIds: string[]; // LA term date ids (Term 1..6)
  height?: number; // px
};

type Counts = { green: number; amber: number; red: number; total: number };

function classify(statusRaw: any): "green" | "amber" | "red" | "ignore" {
  const s = String(statusRaw ?? "").toLowerCase().trim();
  if (!s) return "amber"; // if it exists but is blank, treat as pending-ish

  if (s === "superseded") return "ignore";

  // Green (done)
  if (s === "signed" || s === "approved") return "green";

  // Amber (in progress)
  if (
    s === "pending" ||
    s === "sent" ||
    s === "review" ||
    s === "pending_review" ||
    s === "pending review"
  )
    return "amber";

  // Everything else is treated as red (problem/needs attention)
  return "red";
}

export default function TermDeclarationStatusBar({
  nurseryId,
  termBlockIds,
  height = 6,
}: Props) {
  const [counts, setCounts] = useState<Counts>({
    green: 0,
    amber: 0,
    red: 0,
    total: 0,
  });

  const stableIds = useMemo(
    () => (termBlockIds ?? []).filter(Boolean),
    [termBlockIds]
  );

  useEffect(() => {
    if (!nurseryId || stableIds.length === 0) {
      setCounts({ green: 0, amber: 0, red: 0, total: 0 });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        let green = 0;
        let amber = 0;
        let red = 0;

        // Pull declarations for each underlying LA block and aggregate
        const results = await Promise.all(
          stableIds.map(async (termId) => {
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

        const all = results.flat();

        for (const it of all) {
          const bucket = classify((it as any).status);
          if (bucket === "ignore") continue;
          if (bucket === "green") green += 1;
          else if (bucket === "amber") amber += 1;
          else red += 1;
        }

        const total = green + amber + red;

        if (!cancelled) {
          setCounts({ green, amber, red, total });
        }
      } catch {
        if (!cancelled) setCounts({ green: 0, amber: 0, red: 0, total: 0 });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, stableIds]);

  const { total } = counts;

  // Theme-aligned colours
  const C_BG = "#E5E7EB";   // grey base
  const C_GREEN = "#4CAF78"; // your green
  const C_AMBER = "#F08A00"; // your orange/amber
  const C_RED = "#B91C1C";

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const segments = [
    { key: "green", color: C_GREEN, pct: pct(counts.green) },
    { key: "amber", color: C_AMBER, pct: pct(counts.amber) },
    { key: "red", color: C_RED, pct: pct(counts.red) },
  ].filter((s) => s.pct > 0.01);

  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 999,
        background: C_BG,
        overflow: "hidden",
      }}
      title={
        total === 0
          ? "No declarations yet"
          : `Signed: ${counts.green}, Pending: ${counts.amber}, Attention: ${counts.red}`
      }
    >
      {total > 0 && (
        <div style={{ display: "flex", height: "100%" }}>
          {segments.map((s) => (
            <div
              key={s.key}
              style={{
                width: `${s.pct}%`,
                background: s.color,
                height: "100%",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
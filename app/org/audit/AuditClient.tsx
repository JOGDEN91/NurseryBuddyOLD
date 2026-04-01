// app/org/audit/AuditClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import StaffCard from "@/components/StaffCard";

type NurseryOpt = { id: string; name: string };
type TermOpt = { anchor_id: string; label: string; start_date: string | null; end_date: string | null };

type AuditItem = {
  ts: string;
  category: "Declarations" | "Documents" | "Requests" | "Staff";
  title: string;
  subtitle?: string | null;
  child?: { id: string; name: string } | null;
  nursery?: { id: string; name: string } | null;
  actor?: { user_id: string | null; display_name: string | null; email: string | null } | null;
  source: { table: string; id: string | null };
  details: any;
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB");
}

function chip(label: string, value: number) {
  return (
    <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #EEE" }}>
      {label}: <b>{value}</b>
    </div>
  );
}

export default function AuditClient({
  orgId,
  nurseries,
  initialNurseryId,
  terms,
  initialTermId,
}: {
  orgId: string;
  nurseries: NurseryOpt[];
  initialNurseryId: string | null;
  terms: TermOpt[];
  initialTermId: string;
}) {
  const [nurseryId, setNurseryId] = useState<string>(initialNurseryId || "");
  const [termId, setTermId] = useState<string>(initialTermId || "");
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Record<string, boolean>>({
    Declarations: true,
    Documents: true,
    Requests: true,
    Staff: true,
  });

  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ counts: any; term: any; items: AuditItem[] } | null>(null);

  useEffect(() => {
    if (!termId) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams();
        params.set("term_id", termId);
        if (nurseryId) params.set("nursery_id", nurseryId);
        params.set("limit", "400");

        const res = await fetch(`/api/org/audit?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || j?.ok === false) {
          setData(null);
          return;
        }
        setData({ counts: j.counts, term: j.term, items: j.items ?? [] });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, termId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const allowed = new Set(Object.entries(cats).filter(([, v]) => v).map(([k]) => k));

    return (data?.items ?? []).filter((it) => {
      if (!allowed.has(it.category)) return false;
      if (!qq) return true;

      const hay = [
        it.title,
        it.subtitle ?? "",
        it.child?.name ?? "",
        it.nursery?.name ?? "",
        it.actor?.display_name ?? "",
        it.actor?.email ?? "",
        JSON.stringify(it.details ?? {}),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [data, q, cats]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <StaffCard title="Audit">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Nursery</div>
              <select
                value={nurseryId}
                onChange={(e) => setNurseryId(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", minWidth: 260 }}
              >
                <option value="">All nurseries</option>
                {nurseries.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Term</div>
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", minWidth: 260 }}
              >
                {terms.map((t) => (
                  <option key={t.anchor_id} value={t.anchor_id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 6, flex: "1 1 260px" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Search</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search child, document, action…"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {Object.keys(cats).map((k) => (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={cats[k]}
                  onChange={(e) => setCats((prev) => ({ ...prev, [k]: e.target.checked }))}
                />
                {k}
              </label>
            ))}
          </div>

          {data?.counts && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {chip("Declarations", data.counts.declarations ?? 0)}
              {chip("Documents", data.counts.documents ?? 0)}
              {chip("Requests", data.counts.requests ?? 0)}
              {chip("Staff", data.counts.staff ?? 0)}
              {chip("Total", data.counts.total ?? 0)}
            </div>
          )}

          {data?.term && (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Window: <b>{data.term.window_start ?? "—"}</b> → <b>{data.term.window_end ?? "—"}</b>
              {data.term.label ? <> · Group: <b>{data.term.label}</b></> : null}
            </div>
          )}
        </div>
      </StaffCard>

      <StaffCard title="Timeline" noStretch>
        {busy && <div style={{ opacity: 0.7 }}>Loading…</div>}

        {!busy && filtered.length === 0 && (
          <div style={{ opacity: 0.7 }}>No events found for the current filters.</div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {filtered.slice(0, 400).map((it, idx) => (
            <div key={idx} style={{ border: "1px solid #EEE", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>
                  {it.category} · {it.title}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtDateTime(it.ts)}</div>
              </div>

              {it.subtitle && <div style={{ marginTop: 4, opacity: 0.85 }}>{it.subtitle}</div>}

              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {it.child?.name ? <div>Child: <b>{it.child.name}</b></div> : null}
                {it.nursery?.name ? <div>Nursery: <b>{it.nursery.name}</b></div> : null}
                {it.actor?.display_name || it.actor?.email ? (
                  <div>
                    Actor: <b>{it.actor.display_name || it.actor.email}</b>
                  </div>
                ) : null}
                <div style={{ opacity: 0.75 }}>
                  Source: {it.source.table}{it.source.id ? ` (${it.source.id})` : ""}
                </div>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>Details</summary>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    opacity: 0.9,
                    background: "#FAFAFA",
                    border: "1px solid #EEE",
                    borderRadius: 10,
                    padding: 10,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(it.details ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      </StaffCard>
    </div>
  );
}
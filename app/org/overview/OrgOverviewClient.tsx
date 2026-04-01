// app/org/overview/OrgOverviewClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import StaffCard from "@/components/StaffCard";
import { useSearchParams } from "next/navigation";
import { OrgContextStrip } from "../_components/OrgContextStrip";

type Nursery = { id: string; name: string };

type InvoiceMode = "monthly" | "termly";

type DeclCounts = { signed: number; pending: number; attention: number; total: number };
type NurseryStats = { declarations: DeclCounts; unreadMessages: number };

type FinanceSummary = {
  term: { id: string; label: string; start_date: string | null; end_date: string | null; weeks: number };
  totals: {
    childrenCount: number;
    attendedWeekly: number;
    fundedWeekly: number;
    payableWeekly: number;
    tuitionWeekly: number;
    consPerTerm: number;
    count15: number;
    count30: number;
    fundingWeeklyValue: number;
    missing_rate_rows?: number;
  };
  financials: {
    monthly: {
      tuition: number;
      consumables: number;
      totalPayable: number;
      funding: number;
      totalIncome: number;
    };
    termly: {
      tuition: number;
      consumables: number;
      totalPayable: number;
      funding: number;
      totalIncome: number;
    };
  };
};

type DocQueueItem = {
  id: string;
  status: string;
  label: string;
  updated_at: string | null;
  child_id: string;
  child_name: string;
  nursery_id: string;
  nursery_name: string;
};

type DocumentsQueue = {
  items: DocQueueItem[];
  counts: { pending: number; review: number; requested: number; total: number };
};

type Movements = {
  term: { id: string; label: string; start_date: string; end_date: string; prev_start_date: string | null };
  counts: { starting: number; leaving: number; changes: number };
  starting: Array<{ child_id: string; child_name: string; nursery_name: string; date: string }>;
  leaving: Array<{ child_id: string; child_name: string; nursery_name: string; date: string }>;
  changes: Array<{ child_id: string; child_name: string; nursery_name: string; from: string; to: string; reason: string }>;
};

function classifyDeclaration(statusRaw: any): "signed" | "pending" | "attention" | "ignore" {
  const s = String(statusRaw ?? "").toLowerCase().trim();
  if (s === "superseded") return "ignore";
  if (s === "signed" || s === "approved") return "signed";
  if (s === "pending" || s === "sent" || s === "review" || s === "pending_review") return "pending";
  if (!s) return "pending";
  return "attention";
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB");
}

function formatGBP(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function normISO(d?: string | null) {
  if (!d) return null;
  const v = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return v;
}

function extractSeason(label: string | null | undefined): "Autumn" | "Spring" | "Summer" | null {
  const t = String(label ?? "").trim();
  if (!t) return null;

  const m = t.match(/\((autumn|spring|summer)\)/i);
  if (m?.[1]) {
    const s = m[1].toLowerCase();
    return s === "autumn" ? "Autumn" : s === "spring" ? "Spring" : "Summer";
  }

  if (/autumn/i.test(t)) return "Autumn";
  if (/spring/i.test(t)) return "Spring";
  if (/summer/i.test(t)) return "Summer";
  return null;
}

function academicYearStartFromIso(startIso?: string | null): number | null {
  const s = normISO(startIso);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  return m >= 8 ? y : y - 1; // Sep..Dec => year, else previous year
}

function academicYearLabel(startYear: number) {
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

function looksLikeSeasonLabel(label: string | null | undefined) {
  const t = String(label ?? "");
  return /(Autumn|Spring|Summer)\s+\d{4}\/\d{2}/i.test(t);
}

function ProgressBar({ counts }: { counts: DeclCounts }) {
  const C_BG = "#E5E7EB";
  const C_GREEN = "#4CAF78";
  const C_AMBER = "#F08A00";
  const C_RED = "#B91C1C";

  if (counts.total === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: 6,
          borderRadius: 999,
          background: C_BG,
        }}
        title="No declarations yet"
      />
    );
  }

  const g = (counts.signed / counts.total) * 100;
  const a = (counts.pending / counts.total) * 100;
  const r = (counts.attention / counts.total) * 100;

  return (
    <div style={{ width: "100%", height: 6, borderRadius: 999, background: C_BG, overflow: "hidden" }}>
      <div style={{ display: "flex", height: "100%" }}>
        {g > 0.01 && <div style={{ width: `${g}%`, background: C_GREEN }} />}
        {a > 0.01 && <div style={{ width: `${a}%`, background: C_AMBER }} />}
        {r > 0.01 && <div style={{ width: `${r}%`, background: C_RED }} />}
      </div>
    </div>
  );
}

export default function OrgOverviewClient({
  orgName,
  nurseries,
  initialTermId,
  invoiceModeDefault,
}: {
  orgName: string;
  nurseries: Nursery[];
  initialTermId: string | null;
  invoiceModeDefault: InvoiceMode;
}) {
  const searchParams = useSearchParams();
  const termId = searchParams.get("term_id") || initialTermId || "";

  const [termDisplay, setTermDisplay] = useState<string | null>(null);

  // Existing: per nursery stats (declarations + unread)
  const [statsByNursery, setStatsByNursery] = useState<Record<string, NurseryStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  // NEW: finance summary
  const [finance, setFinance] = useState<FinanceSummary | null>(null);

  // NEW: overview finance display mode (monthly/termly)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>(invoiceModeDefault);

  // Revert to default when the selected term changes
  useEffect(() => {
    setInvoiceMode(invoiceModeDefault);
  }, [termId, invoiceModeDefault]);

  // NEW: documents queue
  const [docQueue, setDocQueue] = useState<DocumentsQueue | null>(null);

  // NEW: movements
  const [movements, setMovements] = useState<Movements | null>(null);

  // Resolve a human-readable term label (season label derived from the selected LA term)
  useEffect(() => {
    if (!termId) {
      setTermDisplay(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Use the same anchor nursery as the rest of the org UI (cookie if present, else first nursery)
        const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
        const m = cookie.match(/(?:^|;\s*)nb\.nurseryId=([^;]+)/);
        const cookieNurseryId = m?.[1] ? decodeURIComponent(m[1]) : null;

        const anchorNurseryId =
          (cookieNurseryId && nurseries.some((n) => n.id === cookieNurseryId) ? cookieNurseryId : nurseries[0]?.id) ||
          null;

        if (!anchorNurseryId) {
          if (!cancelled) setTermDisplay("Selected term");
          return;
        }

        const params = new URLSearchParams();
        params.set("nursery_id", anchorNurseryId);

        const res = await fetch(`/api/org/declarations?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;

        const terms = res.ok && j?.ok !== false && Array.isArray(j.terms) ? (j.terms as any[]) : [];
        const found = terms.find((t) => String(t?.id ?? "") === String(termId)) ?? null;

        const laLabel = String(found?.label ?? found?.name ?? "Selected term");
        const laStart = normISO(found?.start_date ?? found?.la_start_date ?? found?.starts_on ?? null);
        const laEnd = normISO(found?.end_date ?? found?.la_end_date ?? found?.ends_on ?? null);

        const season = extractSeason(laLabel);
        const ayStart = academicYearStartFromIso(laStart) ?? academicYearStartFromIso(laEnd);

        if (season && ayStart != null) {
          setTermDisplay(`${season} ${academicYearLabel(ayStart)}`);
        } else {
          setTermDisplay(laLabel);
        }
      } catch {
        if (!cancelled) setTermDisplay("Selected term");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [termId, nurseries]);

  // Load per-nursery declarations + unread
  useEffect(() => {
    if (nurseries.length === 0) return;

    let cancelled = false;

    async function load() {
      setLoadingStats(true);
      try {
        const results = await Promise.all(
          nurseries.map(async (n) => {
            // Declarations (term-scoped)
            let decl: DeclCounts = { signed: 0, pending: 0, attention: 0, total: 0 };

            if (termId) {
              const params = new URLSearchParams();
              params.set("nursery_id", n.id);
              params.set("term_id", termId);

              const res = await fetch(`/api/org/declarations?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
                credentials: "include",
              });
              const j = await res.json().catch(() => ({} as any));
              const items = res.ok && j.ok !== false && Array.isArray(j.items) ? j.items : [];

              for (const it of items as any[]) {
                const bucket = classifyDeclaration(it?.status);
                if (bucket === "ignore") continue;
                decl.total += 1;
                if (bucket === "signed") decl.signed += 1;
                else if (bucket === "pending") decl.pending += 1;
                else decl.attention += 1;
              }
            }

            // Unread messages per nursery
            let unreadMessages = 0;
            try {
              const params = new URLSearchParams();
              params.set("nursery_id", n.id);
              const res = await fetch(`/api/org/messages/unread-count?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
                credentials: "include",
              });
              const j = await res.json().catch(() => ({} as any));
              if (res.ok && j.ok !== false && typeof j.total === "number") unreadMessages = j.total;
            } catch {
              unreadMessages = 0;
            }

            return { nurseryId: n.id, declarations: decl, unreadMessages };
          })
        );

        if (cancelled) return;

        const map: Record<string, NurseryStats> = {};
        for (const r of results) {
          map[r.nurseryId] = { declarations: r.declarations, unreadMessages: r.unreadMessages };
        }
        setStatsByNursery(map);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nurseries, termId]);

  const aggregated = useMemo(() => {
    let signed = 0,
      pending = 0,
      attention = 0,
      total = 0,
      unread = 0;
    for (const n of nurseries) {
      const s = statsByNursery[n.id];
      if (!s) continue;
      signed += s.declarations.signed;
      pending += s.declarations.pending;
      attention += s.declarations.attention;
      total += s.declarations.total;
      unread += s.unreadMessages;
    }
    return { signed, pending, attention, total, unread };
  }, [statsByNursery, nurseries]);

  // NEW: finance summary
  useEffect(() => {
    if (!termId) {
      setFinance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("term_id", termId);
        const res = await fetch(`/api/org/finance/summary?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (res.ok && j.ok !== false) {
          setFinance(j as FinanceSummary);
          if (looksLikeSeasonLabel((j as any)?.term?.label)) setTermDisplay((j as any).term.label);
        } else {
          setFinance(null);
        }
      } catch {
        if (!cancelled) setFinance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [termId]);

  // NEW: documents queue
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("statuses", "pending,review,requested");
        params.set("limit", "15");
        const res = await fetch(`/api/org/documents/queue?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (res.ok && j.ok !== false) setDocQueue(j as DocumentsQueue);
        else setDocQueue(null);
      } catch {
        if (!cancelled) setDocQueue(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nurseries.length]);

  // NEW: movements
  useEffect(() => {
    if (!termId) {
      setMovements(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("term_id", termId);
        const res = await fetch(`/api/org/movements?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (res.ok && j.ok !== false) {
          setMovements(j as Movements);
          if (looksLikeSeasonLabel((j as any)?.term?.label)) setTermDisplay((j as any).term.label);
        } else setMovements(null);
      } catch {
        if (!cancelled) setMovements(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [termId]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OrgContextStrip orgName={orgName} nurseryName="All nurseries" termLabel={termDisplay} />

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "2fr 1fr",
          alignItems: "start",
        }}
      >
        {/* LEFT */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Nurseries at a glance */}
          <StaffCard title="Nurseries at a glance" noStretch>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {termId ? <>Showing declaration progress and unread messages for the selected term.</> : <>Select a term (from Nursery mode) to show term-based progress.</>}
              </div>

              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                {nurseries.map((n) => {
                  const stats = statsByNursery[n.id];
                  const decl = stats?.declarations ?? { signed: 0, pending: 0, attention: 0, total: 0 };
                  const unread = stats?.unreadMessages ?? 0;

                  return (
                    <div
                      key={n.id}
                      style={{
                        minWidth: 260,
                        border: "1px solid #E6E4E0",
                        borderRadius: 12,
                        background: "#fff",
                        padding: 12,
                        display: "grid",
                        gap: 8,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800 }}>{n.name}</div>
                        {unread > 0 && (
                          <div
                            style={{
                              background: "#EF4444",
                              color: "#fff",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                            title="Unread messages"
                          >
                            {unread > 9 ? "9+" : unread}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>Declarations</div>
                        <ProgressBar counts={decl} />
                        <div style={{ fontSize: 12, color: "#6B7280" }}>
                          {decl.total === 0 ? "No declarations yet" : `${pct(decl.signed, decl.total)}% signed • ${decl.pending} pending • ${decl.attention} attention`}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href="/org/nursery/overview" style={{ textDecoration: "underline", fontSize: 12 }}>
                          Open nursery
                        </a>
                        <a
                          href={`/org/declarations${termId ? `?term_id=${encodeURIComponent(termId)}` : ""}`}
                          style={{ textDecoration: "underline", fontSize: 12 }}
                        >
                          Declarations
                        </a>
                        <a href="/org/messages" style={{ textDecoration: "underline", fontSize: 12 }}>
                          Messages
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </StaffCard>

          {/* Term readiness */}
          <StaffCard title="Term readiness" noStretch>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Organisation-wide snapshot for the selected term.</div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Declarations completion</div>
                <ProgressBar
                  counts={{
                    signed: aggregated.signed,
                    pending: aggregated.pending,
                    attention: aggregated.attention,
                    total: aggregated.total,
                  }}
                />
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  {aggregated.total === 0
                    ? "No declarations yet"
                    : `${pct(aggregated.signed, aggregated.total)}% signed • ${aggregated.pending} pending • ${aggregated.attention} attention`}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #EEE", paddingTop: 10, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Next actions</div>
                <div style={{ fontSize: 12, color: "#374151" }}>• Generate declarations where needed</div>
                <div style={{ fontSize: 12, color: "#374151" }}>• Chase outstanding parent signatures</div>
                <div style={{ fontSize: 12, color: "#374151" }}>• Verify pending documents</div>
              </div>
            </div>
          </StaffCard>

          {/* NEW: Movements */}
          <StaffCard title={termDisplay ? `Movements in ${termDisplay}` : "Movements"} noStretch>
            {!termId ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Select a term to view movements.</div>
            ) : !movements ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Loading movements…</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#6B7280" }}>
                  LA dates {fmtDate(movements.term.start_date)} → {fmtDate(movements.term.end_date)}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Starting</div>
                    {movements.starting.length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>None.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                        {movements.starting.slice(0, 8).map((r) => (
                          <div key={r.child_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 600 }}>
                              {r.child_name} <span style={{ opacity: 0.6 }}>({r.nursery_name})</span>
                            </div>
                            <div style={{ opacity: 0.7 }}>{fmtDate(r.date)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Leaving</div>
                    {movements.leaving.length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>None.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                        {movements.leaving.slice(0, 8).map((r) => (
                          <div key={r.child_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 600 }}>
                              {r.child_name} <span style={{ opacity: 0.6 }}>({r.nursery_name})</span>
                            </div>
                            <div style={{ opacity: 0.7 }}>{fmtDate(r.date)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Funding changes</div>
                  {movements.changes.length === 0 ? (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>No funding changes detected.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: "left", borderBottom: "1px solid #EEE" }}>
                            <th style={{ padding: "8px 6px" }}>Child</th>
                            <th style={{ padding: "8px 6px" }}>Nursery</th>
                            <th style={{ padding: "8px 6px" }}>From</th>
                            <th style={{ padding: "8px 6px" }}>To</th>
                            <th style={{ padding: "8px 6px" }}>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.changes.slice(0, 10).map((r) => (
                            <tr key={r.child_id} style={{ borderBottom: "1px solid #F2F1EE" }}>
                              <td style={{ padding: "8px 6px", fontWeight: 600 }}>{r.child_name}</td>
                              <td style={{ padding: "8px 6px", opacity: 0.75 }}>{r.nursery_name}</td>
                              <td style={{ padding: "8px 6px" }}>{r.from}</td>
                              <td style={{ padding: "8px 6px" }}>{r.to}</td>
                              <td style={{ padding: "8px 6px", opacity: 0.85 }}>{r.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </StaffCard>

          {/* Finance summary */}
          <StaffCard title="Finance summary" noStretch>
            {!termId ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Select a term to view finance totals.</div>
            ) : !finance ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Loading finance summary…</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>
                    {finance.term.label} · {fmtDate(finance.term.start_date)} → {fmtDate(finance.term.end_date)} ·{" "}
                    {finance.term.weeks} weeks
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                    <label style={{ fontSize: 12, color: "#6B7280" }}>Display:</label>
                    <select
                      value={invoiceMode}
                      onChange={(e) => setInvoiceMode((e.target.value as InvoiceMode) || invoiceModeDefault)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #DADADA",
                        background: "#fff",
                      }}
                      aria-label="Finance display mode"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="termly">Termly</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 14,
                    gridTemplateColumns: "1.2fr 1fr",
                    alignItems: "start",
                  }}
                >
                  {/* LEFT: Summary tiles (like Finance page) */}
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                    {[
                      ["Total children", finance.totals.childrenCount],
                      ["Total hours attended (wk)", finance.totals.attendedWeekly],
                      ["Total hours funded (wk)", finance.totals.fundedWeekly],
                      ["Total hours payable (wk)", finance.totals.payableWeekly],
                      ["15h funded children", finance.totals.count15],
                      ["30h funded children", finance.totals.count30],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        style={{
                          border: "1px solid #EEE",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fff",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase" }}>{label as any}</div>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{value as any}</div>
                      </div>
                    ))}
                  </div>

                  {/* RIGHT: Financials - Monthly (like Finance page) */}
                  <div style={{ display: "grid", gap: 8 }}>
                    {(() => {
                      const f = invoiceMode === "termly" ? finance.financials.termly : finance.financials.monthly;

                      return (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 900 }}>
                            Financials – {invoiceMode === "monthly" ? "Monthly" : "Termly"}
                          </div>

                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>Total Fees to be Collected</div>
                              <div style={{ fontWeight: 800 }}>{formatGBP(f.tuition)}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>Total Consumables to be Collected</div>
                              <div style={{ fontWeight: 800 }}>{formatGBP(f.consumables)}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>Total Amount Payable</div>
                              <div style={{ fontWeight: 800 }}>{formatGBP(f.totalPayable)}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>Total Funding to be received</div>
                              <div style={{ fontWeight: 800 }}>{formatGBP(f.funding)}</div>
                            </div>

                            <div
                              style={{
                                borderTop: "1px solid #EEE",
                                paddingTop: 10,
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <div style={{ fontWeight: 900 }}>TOTAL INCOME</div>
                              <div style={{ fontWeight: 900 }}>{formatGBP(f.totalIncome)}</div>
                            </div>
                          </div>

                          {!!finance.totals.missing_rate_rows && finance.totals.missing_rate_rows > 0 && (
                            <div style={{ fontSize: 11, color: "#6B7280" }}>
                              Note: {finance.totals.missing_rate_rows} funded line(s) have no configured hourly rate. Funding excludes
                              those lines (Org Settings → Funding rates).
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <a
                  href={`/org/finance${termId ? `?term_id=${encodeURIComponent(termId)}` : ""}`}
                  style={{ textDecoration: "underline", fontSize: 12 }}
                >
                  Open finance
                </a>
              </div>
            )}
          </StaffCard>

          {/* Communications */}
          <StaffCard title="Communications" noStretch>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Total unread</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#4CAF78" }}>{aggregated.unread}</div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {nurseries.map((n) => {
                  const unread = statsByNursery[n.id]?.unreadMessages ?? 0;
                  if (unread === 0) return null;
                  return (
                    <div key={n.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{n.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#EF4444" }}>{unread > 9 ? "9+" : unread}</div>
                    </div>
                  );
                })}

                {nurseries.every((n) => (statsByNursery[n.id]?.unreadMessages ?? 0) === 0) && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>No unread messages.</div>
                )}
              </div>

              <a href="/org/messages" style={{ textDecoration: "underline", fontSize: 12 }}>
                Open messages
              </a>
            </div>
          </StaffCard>
        </div>

        {/* RIGHT: attention required (now includes document queue) */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <StaffCard title="Attention required" noStretch>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                Cross-nursery queue for the selected term (declarations + comms + documents).
              </div>

              {/* Documents queue summary */}
              <div style={{ border: "1px solid #EEE", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Documents</div>
                {!docQueue ? (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Loading…</div>
                ) : docQueue.items.length === 0 ? (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>No documents in queue.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      {docQueue.counts.pending} pending • {docQueue.counts.review} review • {docQueue.counts.requested} requested
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      {docQueue.items.slice(0, 10).map((d) => (
                        <div key={d.id} style={{ display: "grid", gap: 2 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 700 }}>{d.child_name}</div>
                            <div style={{ opacity: 0.7 }}>{d.nursery_name}</div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                            <div style={{ opacity: 0.85 }}>{d.label}</div>
                            <div style={{ fontWeight: 800, color: "#8A5A00" }}>{String(d.status).toUpperCase()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <a href="/org/documents" style={{ textDecoration: "underline", fontSize: 12 }}>
                      Open documents
                    </a>
                  </>
                )}
              </div>

              {/* Existing per-nursery attention */}
              {loadingStats ? (
                <div style={{ fontSize: 13, opacity: 0.7 }}>Loading…</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {nurseries.map((n) => {
                    const s = statsByNursery[n.id];
                    if (!s) return null;

                    const lines: Array<{ text: string; tone: "red" | "amber" | "neutral" }> = [];

                    if (s.declarations.attention > 0)
                      lines.push({ text: `${s.declarations.attention} declarations need attention`, tone: "red" });

                    if (s.declarations.pending > 0) lines.push({ text: `${s.declarations.pending} declarations pending`, tone: "amber" });

                    if (s.unreadMessages > 0) lines.push({ text: `${s.unreadMessages} unread messages`, tone: "neutral" });

                    if (lines.length === 0) return null;

                    return (
                      <div
                        key={n.id}
                        style={{
                          border: "1px solid #EEE",
                          borderRadius: 10,
                          padding: 10,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{n.name}</div>
                        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          {lines.map((l, idx) => (
                            <div
                              key={idx}
                              style={{
                                color: l.tone === "red" ? "#8A1F1F" : l.tone === "amber" ? "#8A5A00" : "#374151",
                                fontWeight: l.tone === "neutral" ? 600 : 700,
                              }}
                            >
                              {l.text}
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                          <a
                            href={`/org/declarations${termId ? `?term_id=${encodeURIComponent(termId)}` : ""}`}
                            style={{ textDecoration: "underline", fontSize: 12 }}
                          >
                            View declarations
                          </a>
                          <a href="/org/messages" style={{ textDecoration: "underline", fontSize: 12 }}>
                            Open messages
                          </a>
                        </div>
                      </div>
                    );
                  })}

                  {nurseries.every((n) => {
                    const s = statsByNursery[n.id];
                    return !s || s.declarations.pending + s.declarations.attention + s.unreadMessages === 0;
                  }) && <div style={{ fontSize: 13, opacity: 0.7 }}>No outstanding items detected.</div>}
                </div>
              )}
            </div>
          </StaffCard>
        </div>
      </div>
    </div>
  );
}
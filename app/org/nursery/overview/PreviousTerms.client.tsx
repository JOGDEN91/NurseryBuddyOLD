"use client";

import * as React from "react";
import StaffCard from "@/components/StaffCard";
import type { Term } from "./page";

function normISO(d?: string | null) {
  if (!d) return null;
  const v = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}

function fmt(d?: string | null) {
  const iso = normISO(d);
  if (!iso) return "—";
  const x = new Date(iso);
  return isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB");
}

function academicYearStartFromIso(startIso?: string | null, endIso?: string | null): number | null {
  const s = normISO(startIso);
  const e = normISO(endIso);
  const pick = s || e;
  if (!pick) return null;

  const d = new Date(pick);
  if (isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan, 8=Sep
  return m >= 8 ? y : y - 1;
}

function academicYearLabel(startYear: number) {
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

function seasonLabel(t: Term) {
  const raw = String((t as any).season ?? t.name ?? "").toLowerCase();
  if (raw.includes("aut")) return "Autumn";
  if (raw.includes("spr")) return "Spring";
  if (raw.includes("sum")) return "Summer";
  return (t as any).season ?? t.name ?? "Term";
}

function auditAnchorId(t: Term): string {
  const blk = t.blocks?.[0]?.id;
  return (blk ?? (t as any).la_term_date_id ?? t.id) as string;
}

function hrefsForTerm(t: Term, nurseryId: string) {
  const anchor = auditAnchorId(t);

  return {
    funding: `/org/funding?term_id=${encodeURIComponent(anchor)}`,
    documents: `/org/documents?term_id=${encodeURIComponent(anchor)}`,
    audit: `/org/audit?nursery_id=${encodeURIComponent(nurseryId)}&term_id=${encodeURIComponent(anchor)}`,
  };
}

type TermCardModel = {
  term: Term;
  ayStart: number;
  ayLabel: string;
  season: string;
  endTs: number;
  startTs: number;
};

function buildModels(past: Term[]): TermCardModel[] {
  return (past ?? [])
    .filter((t) => !!t.end_date)
    .map((t) => {
      const ayStart =
        academicYearStartFromIso(t.start_date ?? null, t.end_date ?? null) ??
        (typeof (t as any).year === "number" ? (t as any).year : null) ??
        new Date().getFullYear();

      const s = normISO(t.start_date ?? null);
      const e = normISO(t.end_date ?? null);

      const startTs = s ? new Date(s).getTime() : 0;
      const endTs = e ? new Date(e).getTime() : 0;

      return {
        term: t,
        ayStart,
        ayLabel: academicYearLabel(ayStart),
        season: seasonLabel(t),
        startTs,
        endTs,
      };
    })
    .sort((a, b) => (b.endTs || b.startTs) - (a.endTs || a.startTs));
}

function uniqueAcademicYears(models: TermCardModel[]) {
  const seen = new Map<number, string>();
  for (const m of models) seen.set(m.ayStart, m.ayLabel);
  return Array.from(seen.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([start, label]) => ({ start, label }));
}

function IconLink({ href, title, icon }: { href: string; title: string; icon: string }) {
  return (
    <a
      href={href}
      title={title}
      aria-label={title}
      style={{
        width: 34,
        height: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: "1px solid #E6E4E0",
        background: "#fff",
        textDecoration: "none",
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
    </a>
  );
}

export default function PreviousTermsClient({ past, nurseryId }: { past: Term[]; nurseryId: string }) {
  const models = React.useMemo(() => buildModels(past), [past]);
  const years = React.useMemo(() => uniqueAcademicYears(models), [models]);

  const mostRecent = models[0] ?? null;

  const [ayStart, setAyStart] = React.useState<number | null>(mostRecent?.ayStart ?? years[0]?.start ?? null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (mostRecent?.ayStart != null) setAyStart(mostRecent.ayStart);
  }, [mostRecent?.ayStart]);

  const inYear = React.useMemo(() => {
    if (ayStart == null) return models;
    return models.filter((m) => m.ayStart === ayStart);
  }, [models, ayStart]);

  const visibleCards = React.useMemo(() => {
    if (!expanded) return mostRecent ? [mostRecent] : [];
    return inYear;
  }, [expanded, mostRecent, inYear]);

  return (
    <StaffCard title="Previous terms" noStretch>
      {models.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No previous terms.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Academic year</div>
              <select
                value={ayStart ?? ""}
                onChange={(e) => setAyStart(e.target.value ? parseInt(e.target.value, 10) : null)}
                style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff" }}
                disabled={!expanded}
                title={expanded ? "Filter by academic year" : "Expand to view more years"}
              >
                {years.map((y) => (
                  <option key={y.start} value={y.start}>
                    {y.label}
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 12, opacity: 0.65 }}>
                {expanded ? "Showing banked terms for the selected academic year." : "Showing the most recent completed term."}
              </div>
            </div>

            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                border: "1px solid #DADADA",
                background: "#fff",
                borderRadius: 10,
                padding: "6px 10px",
                fontWeight: 900,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {expanded ? "Hide terms" : "View more terms"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 6,
              scrollSnapType: "x mandatory",
            }}
          >
            {visibleCards.map((m) => {
              const t = m.term;
              const links = hrefsForTerm(t, nurseryId);

              return (
                <div
                  key={t.id}
                  style={{
                    minWidth: 320,
                    maxWidth: 360,
                    border: "1px solid #EEE",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    scrollSnapAlign: "start",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        {m.season} {m.ayLabel}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {fmt(t.start_date)} → {fmt(t.end_date)}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <IconLink href={links.funding} title="Funding" icon="£" />
                      <IconLink href={links.documents} title="Documents" icon="📄" />
                      <IconLink href={links.audit} title="Audit" icon="⏱" />
                    </div>
                  </div>

                  {t.blocks && t.blocks.length > 1 && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Includes {t.blocks.length} blocks.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {expanded && inYear.length === 0 && (
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              No banked terms found for this academic year.
            </div>
          )}
        </div>
      )}
    </StaffCard>
  );
}
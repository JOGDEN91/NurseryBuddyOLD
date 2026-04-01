"use client";

import { useEffect, useMemo, useState } from "react";

/** ---------- Types ---------- */
type NurseryOpt = { id: string; name: string };
type Term = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};
type Row = {
  id: string; // child id
  childName: string;
  dob: string; // may be ISO or dd/mm/yyyy
  parentName: string;
  parentEmail: string;
  attendedWeekly: number;
  fundedWeekly: number; // legacy from API (we recompute, but keep as base)
  hoursPayable: number; // legacy from API (we recompute)
  rate: number;
  amountPayable: number; // legacy weekly tuition (we recompute)
  consumables: number | null; // per-term
  total: number; // legacy duplicate
};
type InvoiceMode = "monthly" | "termly";

type Entitlement = {
  id: string;
  name: string;
  code: string | null;
  hours_per_week: number | null;
  is_active: boolean | null;
};

type RateRow = {
  entitlement_id: string;
  rate_hour: number | null;
};

const CANONICAL_SEASON_TERM_RE = /^(Autumn|Spring|Summer) \d{4}\/\d{2}$/;

/** ---------- Formatting helpers ---------- */
function pounds(n: number | null | undefined) {
  const v = typeof n === "number" ? n : 0;
  return `£${v.toFixed(2)}`;
}
function poundsMaybe(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return pounds(n);
}
function amountFromWeekly(weekly: number, stretchedWeeks: number, mode: InvoiceMode) {
  const w = Math.max(1, Number(stretchedWeeks || 0));
  // annualise weekly*w then split by 12 months or 3 terms
  return mode === "termly" ? (weekly * w) / 3 : (weekly * w) / 12;
}

/** ---------- Date helpers ---------- */
function normISO(s?: string | null): string | null {
  if (!s) return null;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return v;
}

function monthsBetween(dobIso?: string | null, refIso?: string | null): number {
  const dIso = normISO(dobIso);
  const rIso = normISO(refIso);
  if (!dIso || !rIso) return -1;
  const d = new Date(dIso);
  const r = new Date(rIso);
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return -1;
  let y = r.getFullYear() - d.getFullYear();
  let m = r.getMonth() - d.getMonth();
  if (r.getDate() < d.getDate()) m -= 1;
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return y * 12 + m;
}

/** ---------- Entitlement band & age logic ---------- */

/** Returns 0 | 15 | 30 based on flags + age at term start (same as Funding page) */
function computeBand(WP: boolean, D2: boolean, dobIso: string | null, laStartIso: string | null): 0 | 15 | 30 {
  const ageM = monthsBetween(dobIso, laStartIso);
  if (ageM < 0 || ageM < 9 || ageM >= 60) return 0;
  if (ageM < 24) return WP ? 30 : 0; // 9–23m: WP up to 30
  if (ageM < 36) return WP && D2 ? 30 : WP ? 30 : D2 ? 15 : 0; // 24–35m: D2+WP stack to 30
  return WP ? 30 : 15; // 36–59m: U15 + (WP top-up)
}

function annualFromBand(band: 0 | 15 | 30): 0 | 570 | 1140 {
  if (band === 30) return 1140;
  if (band === 15) return 570;
  return 0;
}

function stretchedWeeklyFromBand(band: 0 | 15 | 30, stretchedWeeks: number): number {
  const weeks = Math.max(1, Number(stretchedWeeks || 0));
  const annual = annualFromBand(band);
  return annual === 0 ? 0 : annual / weeks;
}

/** Age segments for your rate bands */
type AgeSegment = "9_23" | "2" | "3_4" | null;

function getAgeSegment(ageM: number): AgeSegment {
  if (ageM < 0) return null;
  if (ageM < 24) return "9_23"; // 9–23 months
  if (ageM < 36) return "2"; // Age 2
  if (ageM < 60) return "3_4"; // Age 3–4
  return null;
}

/** Segment match based on entitlement code/name */
function matchSegment(e: Entitlement, seg: AgeSegment): boolean {
  if (!seg) return true;
  const code = (e.code || "").toUpperCase();
  const name = (e.name || "").toUpperCase();
  const text = `${code} ${name}`;

  switch (seg) {
    case "9_23":
      return /9[_–\-]?23|9\s*–\s*23|9\s*TO\s*23/.test(text);
    case "2":
      return /(_2\b|\b2Y|\bAGE 2|\bTWO YEAR)/.test(text);
    case "3_4":
      return /3[_–\-]?4|3\s*–\s*4|3\s*TO\s*4|\b3-4\b|\bAGE 3-4/.test(text);
    default:
      return true;
  }
}

/** How well an entitlement matches the WP/D2 flags */
function typeScore(e: Entitlement, WP: boolean, D2: boolean): number {
  const code = (e.code || "").toUpperCase();
  const name = (e.name || "").toUpperCase();
  const text = `${code} ${name}`;

  const isWP = text.includes("WP") || text.includes("WORKING");
  const isD2 = text.includes("D2") || text.includes("DISADV");

  if (!WP && !D2) {
    if (!isWP && !isD2) return 3;
    if (!isWP && isD2) return 1;
    if (isWP && !isD2) return 1;
    return 0;
  }
  if (WP && !D2) {
    if (isWP && !isD2) return 4;
    if (isWP && isD2) return 3;
    if (!isWP && !isD2) return 2;
    return 1;
  }
  if (!WP && D2) {
    if (isD2 && !isWP) return 4;
    if (isD2 && isWP) return 3;
    if (!isD2 && !isWP) return 2;
    return 1;
  }
  if (isWP && isD2) return 5;
  if (isWP || isD2) return 3;
  return 1;
}

/** Select the entitlement row for a child (per band + age + flags) */
function selectEntitlementForChild(
  ents: Entitlement[],
  band: 0 | 15 | 30,
  ageM: number,
  flags: { WP: boolean; D2: boolean }
): Entitlement | null {
  if (band === 0 || ageM < 0) return null;
  const seg = getAgeSegment(ageM);
  if (!seg) return null;

  const base = ents.filter((e) => {
    if (e.is_active === false) return false;
    if (Number(e.hours_per_week ?? 0) !== band) return false;
    return true;
  });
  if (!base.length) return null;

  let candidates = base.filter((e) => matchSegment(e, seg));
  if (!candidates.length) candidates = base;

  let best: Entitlement | null = null;
  let bestScore = 0;
  for (const e of candidates) {
    const score = typeScore(e, flags.WP, flags.D2);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function pickCurrentTermId(list: Term[]): string | null {
  const now = Date.now();
  const current = list.find((t) => {
    const s = t.start_date ? new Date(t.start_date).getTime() : NaN;
    const e = t.end_date ? new Date(t.end_date).getTime() : NaN;
    return Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e;
  });
  return current?.id ?? (list[0]?.id ?? null);
}

/** ---------- Component ---------- */
export default function FinanceClient({
  orgId,
  nurseries,
  initialNurseryId,
  initialTerm,
  initialTerms,
  invoiceModeDefault,
  weeks,
}: {
  orgId: string | null;
  nurseries: NurseryOpt[];
  initialNurseryId: string | null;
  initialTerm: Term | null;
  initialTerms: Term[];
  invoiceModeDefault: InvoiceMode;
  weeks: number;
}) {
  const [nurseryId, setNurseryId] = useState<string | null>(initialNurseryId);
  const [termId, setTermId] = useState<string | null>(initialTerm?.id ?? null);
  const [terms, setTerms] = useState<Term[]>(initialTerms);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>(invoiceModeDefault);

  const [claimCache, setClaimCache] = useState<Record<string, { WP: boolean; D2: boolean }>>({});

  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [rateByEntitlement, setRateByEntitlement] = useState<Record<string, number | null>>({});

  const selectedTerm: Term | null = useMemo(
    () => terms.find((t) => t.id === termId) ?? initialTerm ?? null,
    [terms, termId, initialTerm]
  );
  const selectedTermName = selectedTerm?.name ?? null;
  const [laStartIso, setLaStartIso] = useState<string | null>(selectedTerm?.start_date ?? null);

  /** 1) load finance rows when nursery/term changes */
  useEffect(() => {
    if (!nurseryId) return;

    const url = new URL("/api/finance/estimate", window.location.origin);
    url.searchParams.set("nurseryId", nurseryId);
    if (termId) url.searchParams.set("termId", termId);

    (async () => {
      const res = await fetch(url.toString(), {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = await res.json();

      const apiTerms = (data.terms ?? []) as Term[];
      const canonical = apiTerms.filter((t) => CANONICAL_SEASON_TERM_RE.test(String(t.name ?? "")));
      const usable = canonical.length > 0 ? canonical : apiTerms;

      // If API selectedTermId is not within the hardened list, pick a sensible one.
      const apiSelected: string | null = data.selectedTermId ?? null;
      const nextSelected =
        (apiSelected && usable.some((t) => t.id === apiSelected) ? apiSelected : pickCurrentTermId(usable));

      setTerms(usable);
      setTermId(nextSelected);
      setRows((data.rows ?? []) as Row[]);

      document.cookie = `nb.nurseryId=${encodeURIComponent(nurseryId)}; Path=/; Max-Age=31536000; SameSite=Lax`;

      if (data.invoiceMode && invoiceModeDefault !== data.invoiceMode) {
        setInvoiceMode(data.invoiceMode as InvoiceMode);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId, termId]);

  /** 2) LA term start via /api/funding/terms (same as Funding page) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!nurseryId || !selectedTermName) {
        setLaStartIso(selectedTerm?.start_date ?? null);
        return;
      }
      try {
        const url = new URL("/api/funding/terms", window.location.origin);
        url.searchParams.set("nursery_id", nurseryId);
        url.searchParams.set("all", "1");
        const res = await fetch(url.toString(), {
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(j?.terms)) {
          const match = j.terms.find(
            (t: any) => (t.name || "").toLowerCase() === selectedTermName.toLowerCase()
          );
          setLaStartIso(match?.la_start_date ?? selectedTerm?.start_date ?? null);
        } else if (!cancelled) {
          setLaStartIso(selectedTerm?.start_date ?? null);
        }
      } catch {
        if (!cancelled) setLaStartIso(selectedTerm?.start_date ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, selectedTermName, selectedTerm]);

  /** 3) Funding entitlements + org/nursery rates */
  useEffect(() => {
    if (!nurseryId || !orgId) {
      setEntitlements([]);
      setRateByEntitlement({});
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const entRes = await fetch("/api/funding-rates/entitlements", {
          cache: "no-store",
          credentials: "include",
        });
        const entJson = await entRes.json().catch(() => ({}));
        if (!entRes.ok) throw new Error(entJson?.error || "Failed to load entitlements");
        const ents = (entJson.items ?? []) as Entitlement[];

        const orgRes = await fetch(`/api/funding-rates?scope=org&orgId=${encodeURIComponent(orgId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const orgJson = await orgRes.json().catch(() => ({}));
        if (!orgRes.ok) throw new Error(orgJson?.error || "Failed to load org funding rates");
        const orgMap = new Map<string, number>();
        for (const r of (orgJson.items ?? []) as RateRow[]) {
          if (r.rate_hour != null) orgMap.set(r.entitlement_id, r.rate_hour);
        }

        const nurRes = await fetch(`/api/funding-rates?scope=nursery&nurseryId=${encodeURIComponent(nurseryId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const nurJson = await nurRes.json().catch(() => ({}));
        if (!nurRes.ok) throw new Error(nurJson?.error || "Failed to load nursery funding rates");
        const nurMap = new Map<string, number>();
        for (const r of (nurJson.items ?? []) as RateRow[]) {
          if (r.rate_hour != null) nurMap.set(r.entitlement_id, r.rate_hour);
        }

        const rateMap: Record<string, number | null> = {};
        for (const e of ents) {
          const eff = nurMap.get(e.id) ?? orgMap.get(e.id) ?? null;
          rateMap[e.id] = eff;
        }

        if (!cancelled) {
          setEntitlements(ents);
          setRateByEntitlement(rateMap);
        }
      } catch (e) {
        console.warn("Funding rates load failed", e);
        if (!cancelled) {
          setEntitlements([]);
          setRateByEntitlement({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nurseryId, orgId]);

  /** 4) Child flags (WP / D2) */
  useEffect(() => {
    if (!rows.length) return;
    const toFetch = new Set<string>();
    for (const r of rows) {
      if (typeof r.id === "string" && !claimCache[r.id]) toFetch.add(r.id);
    }
    if (toFetch.size === 0) return;

    let cancelled = false;
    (async () => {
      const entries: Record<string, { WP: boolean; D2: boolean }> = {};
      await Promise.all(
        Array.from(toFetch).map(async (id) => {
          try {
            const res = await fetch(`/api/children/${encodeURIComponent(id)}`, {
              credentials: "include",
              cache: "no-store",
            });
            const j = await res.json().catch(() => ({}));
            if (!cancelled && res.ok && j?.child) {
              entries[id] = {
                WP: !!j.child.claim_working_parent,
                D2: !!j.child.claim_disadvantaged2,
              };
            }
          } catch {
            // ignore
          }
        })
      );
      if (!cancelled && Object.keys(entries).length) setClaimCache((prev) => ({ ...prev, ...entries }));
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, claimCache]);

  /** 5) Search filter */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const matchesQ =
        needle.length === 0 ||
        r.childName.toLowerCase().includes(needle) ||
        r.parentName.toLowerCase().includes(needle) ||
        r.parentEmail.toLowerCase().includes(needle);
      return matchesQ;
    });
  }, [rows, q]);

  /** 6) Derive band, fundedWeekly, hoursPayable, tuition & funding per child */
  const derived = useMemo(() => {
    return filtered.map((r) => {
      const flags = claimCache[r.id] ?? { WP: false, D2: false };
      const dobIso = normISO(r.dob);
      const ageM = monthsBetween(dobIso, laStartIso);

      const band = computeBand(flags.WP, flags.D2, dobIso, laStartIso); // 0|15|30

      const fundedWeekly = stretchedWeeklyFromBand(band, weeks);
      const hoursPayable = Math.max(0, (r.attendedWeekly || 0) - fundedWeekly);
      const amountPayable = hoursPayable * (r.rate || 0);

      const ent = selectEntitlementForChild(entitlements, band, ageM, flags);
      const fundingRate = ent && rateByEntitlement[ent.id] != null ? (rateByEntitlement[ent.id] as number) : null;

      const fundingWeeklyValue = fundedWeekly * (fundingRate ?? 0);

      return {
        ...r,
        band,
        fundedWeekly,
        hoursPayable,
        amountPayable,
        fundingRate,
        fundingWeeklyValue,
      };
    });
  }, [filtered, claimCache, laStartIso, weeks, entitlements, rateByEntitlement]);

  /** 7) Weekly summary across all children */
  const summary = useMemo(() => {
    const list = derived;
    const childrenCount = list.length;

    let attendedWeekly = 0;
    let fundedWeekly = 0;
    let payableWeekly = 0;
    let tuitionWeekly = 0;
    let consPerTerm = 0;
    let count15 = 0;
    let count30 = 0;
    let fundingWeeklyValue = 0;

    for (const r of list) {
      const cons = r.consumables ?? 0;
      attendedWeekly += r.attendedWeekly || 0;
      fundedWeekly += r.fundedWeekly || 0;
      payableWeekly += r.hoursPayable || 0;
      tuitionWeekly += r.amountPayable || 0;
      consPerTerm += cons;
      fundingWeeklyValue += r.fundingWeeklyValue || 0;

      if (r.band === 15) count15++;
      else if (r.band === 30) count30++;
    }

    return {
      childrenCount,
      attendedWeekly,
      fundedWeekly,
      payableWeekly,
      tuitionWeekly,
      consPerTerm,
      count15,
      count30,
      fundingWeeklyValue,
    };
  }, [derived]);

  /** 8) Financials for display period */
  const financials = useMemo(() => {
    const tuitionDisp = amountFromWeekly(summary.tuitionWeekly, weeks, invoiceMode);
    const consDisp = invoiceMode === "monthly" ? summary.consPerTerm / 4 : summary.consPerTerm;
    const totalPayable = tuitionDisp + consDisp;

    const fundingDisp =
      summary.fundingWeeklyValue > 0 ? amountFromWeekly(summary.fundingWeeklyValue, weeks, invoiceMode) : null;

    const totalIncome = totalPayable + (fundingDisp ?? 0);
    return { tuitionDisp, consDisp, totalPayable, fundingDisp, totalIncome };
  }, [summary, weeks, invoiceMode]);

  /** 9) CSV export */
  function exportCSV() {
    const headers = [
      "Child",
      "DOB",
      "Parent",
      "Email",
      "Attended / wk",
      "Funded / wk",
      "Hours payable",
      "Rate",
      "Funding rate",
      `Funding amount (${invoiceMode === "monthly" ? "per month" : "per term"})`,
      `Amount (${invoiceMode === "monthly" ? "per month" : "per term"})`,
      "Consumables",
      `Total (${invoiceMode === "monthly" ? "per month" : "per term"})`,
    ];
    const displayRows = derived.map((r) => {
      const amountDisp = amountFromWeekly(r.amountPayable, weeks, invoiceMode);
      const consDisp = invoiceMode === "monthly" ? (r.consumables ?? 0) / 4 : r.consumables ?? 0;
      const fundingAmountDisp =
        r.fundingRate != null ? amountFromWeekly(r.fundedWeekly * r.fundingRate, weeks, invoiceMode) : 0;
      const totalDisp = amountDisp + consDisp;
      return [
        r.childName,
        r.dob,
        r.parentName,
        r.parentEmail,
        r.attendedWeekly.toFixed(2),
        r.fundedWeekly.toFixed(2),
        r.hoursPayable.toFixed(2),
        r.rate.toFixed(2),
        r.fundingRate == null ? "" : r.fundingRate.toFixed(2),
        fundingAmountDisp.toFixed(2),
        amountDisp.toFixed(2),
        consDisp.toFixed(2),
        totalDisp.toFixed(2),
      ];
    });
    const csv = [headers, ...displayRows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filenameTerm = (selectedTerm?.name ?? "term").replace(/\s+/g, "_");
    a.href = url;
    a.download = `finance_${filenameTerm}_${invoiceMode}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const activeTermName = selectedTerm?.name ?? "—";
  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #EAE7E2",
    borderRadius: 12,
    padding: 12,
  };

  /** ---------- Render ---------- */
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Card 1: Controls */}
      <div style={cardStyle}>
        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "260px 260px 1fr 170px 140px",
            alignItems: "center",
          }}
        >
          <select
            value={nurseryId ?? ""}
            onChange={(e) => setNurseryId(e.target.value || null)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#FFF",
            }}
            aria-label="Nursery"
          >
            {nurseries.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>

          <select
            value={termId ?? ""}
            onChange={(e) => setTermId(e.target.value || null)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#FFF",
            }}
            aria-label="Term"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Search child / parent / email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#FFF",
            }}
            aria-label="Search"
          />

          <div
            style={{
              justifySelf: "end",
              display: "flex",
              gap: 8,
              alignItems: "center",
              whiteSpace: "nowrap",
            }}
          >
            <label style={{ fontSize: 12, color: "#6C7A89", marginRight: 4 }}>Display:</label>
            <select
              value={invoiceMode}
              onChange={(e) => setInvoiceMode((e.target.value as InvoiceMode) || "monthly")}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                background: "#FFF",
              }}
              aria-label="Display mode"
            >
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
            </select>
          </div>

          <button
            onClick={exportCSV}
            style={{
              justifySelf: "end",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #D1D5DB",
              background: "#F7F7F7",
              fontWeight: 600,
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Card row: Summary + Financials */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        {/* Summary */}
        <div style={{ ...cardStyle, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>Summary – {activeTermName}</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <Stat label="Total children" value={summary.childrenCount} />
            <Stat label="Total hours attended (wk)" value={summary.attendedWeekly.toFixed(2)} />
            <Stat label="Total hours funded (wk)" value={summary.fundedWeekly.toFixed(2)} />
            <Stat label="Total hours payable (wk)" value={summary.payableWeekly.toFixed(2)} />
            <Stat label="15h funded children" value={summary.count15} />
            <Stat label="30h funded children" value={summary.count30} />
          </div>
        </div>

        {/* Financials */}
        <div style={{ ...cardStyle, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>
            Financials – {invoiceMode === "monthly" ? "Monthly" : "Termly"}
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <RowKV label="Total Fees to be Collected" value={pounds(financials.tuitionDisp)} />
            <RowKV label="Total Consumables to be Collected" value={pounds(financials.consDisp)} />
            <RowKV label="Total Amount Payable" value={pounds(financials.totalPayable)} />
            <RowKV label="Total Funding to be received" value={poundsMaybe(financials.fundingDisp)} />
            <RowKVStrong label="TOTAL INCOME" value={pounds(financials.totalIncome)} />
          </div>
        </div>
      </div>

      {/* Card: Table */}
      <div style={{ ...cardStyle, padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Child</Th>
                <Th>DOB</Th>
                <Th>Parent</Th>
                <Th>Email</Th>
                <Th align="right">Attended / wk</Th>
                <Th align="right">Funded / wk</Th>
                <Th align="right">Hours payable</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Funding rate</Th>
                <Th align="right">Funding amount</Th>
                <Th align="right">{invoiceMode === "monthly" ? "Amount (per month)" : "Amount (per term)"}</Th>
                <Th align="right">Consumables</Th>
                <Th align="right">{invoiceMode === "monthly" ? "Total (per month)" : "Total (per term)"}</Th>
              </tr>
            </thead>
            <tbody>
              {derived.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: 12, opacity: 0.7 }}>
                    No matching children.
                  </td>
                </tr>
              ) : (
                derived.map((r) => {
                  const amountDisp = amountFromWeekly(r.amountPayable, weeks, invoiceMode);
                  const consDisp = invoiceMode === "monthly" ? (r.consumables ?? 0) / 4 : r.consumables ?? 0;
                  const totalDisp = amountDisp + consDisp;

                  const hasFunding = r.fundingRate != null && r.fundedWeekly > 0;
                  const fundingAmountDisp = hasFunding
                    ? amountFromWeekly(r.fundedWeekly * (r.fundingRate as number), weeks, invoiceMode)
                    : 0;

                  const bandBg = r.band === 15 ? "#E3F5E8" : r.band === 30 ? "#E3ECFF" : "#F3F4F6";
                  const bandFg = r.band === 15 ? "#137D3F" : r.band === 30 ? "#1D4ED8" : "#4B5563";

                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid #F1EFEA" }}>
                      <Td>{r.childName}</Td>
                      <Td>{r.dob}</Td>
                      <Td>{r.parentName}</Td>
                      <Td>{r.parentEmail}</Td>
                      <Td align="right">{r.attendedWeekly.toFixed(2)}</Td>
                      <Td align="right">{r.fundedWeekly.toFixed(2)}</Td>
                      <Td align="right">{r.hoursPayable.toFixed(2)}</Td>
                      <Td align="right">{pounds(r.rate)}</Td>

                      <Td align="right">
                        {!hasFunding ? (
                          "—"
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              backgroundColor: bandBg,
                              color: bandFg,
                              fontSize: 14,
                              fontWeight: 600,
                            }}
                          >
                            <span>{pounds(r.fundingRate)}</span>
                          </span>
                        )}
                      </Td>

                      <Td align="right">{!hasFunding ? "—" : pounds(fundingAmountDisp)}</Td>
                      <Td align="right">{pounds(amountDisp)}</Td>
                      <Td align="right">{pounds(consDisp)}</Td>
                      <Td align="right" style={{ fontWeight: 700 }}>
                        {pounds(totalDisp)}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Showing term: <b>{selectedTerm?.name ?? "—"}</b> • Display: <b>{invoiceMode}</b> • Weeks/year (stretched):{" "}
        <b>{weeks}</b>
      </div>
    </div>
  );
}

/* ---------- Presentational helpers ---------- */
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: 10,
        borderBottom: "1px solid " + "#EAE7E2",
        fontWeight: 700,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        color: "#6C7A89",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: 10,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
function Stat({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid #EEE9E2",
        borderRadius: 10,
        padding: "10px 12px",
        background: "#FFF",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, color: "#6C7A89" }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16 }}>{typeof value === "number" ? value : value}</div>
    </div>
  );
}
function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ padding: "6px 8px" }}>{label}</div>
      <div style={{ padding: "6px 8px", textAlign: "right" }}>{value}</div>
    </>
  );
}
function RowKVStrong({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ padding: "6px 8px", fontWeight: 800 }}>{label}</div>
      <div style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{value}</div>
    </>
  );
}

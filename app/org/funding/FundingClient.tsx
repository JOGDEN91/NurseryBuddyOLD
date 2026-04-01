"use client";

import { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";
import { useSearchParams } from "next/navigation";
import { useOrgMeta } from "../_components/OrgMetaContext";
import { OrgContextStrip } from "../_components/OrgContextStrip";

/** styles (unchanged) */
const card: React.CSSProperties = { background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:12 };
const inputCss: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", fontWeight:600, cursor:"pointer" };
const th: React.CSSProperties = { textAlign:"left", padding:10, borderBottom:"1px solid #EEE", position:"sticky", top:0, background:"#FAFAF9", zIndex:1 };

/** shared colors */
const DANGER_RED = "#8A1F1F";
const GREEN = "#1F7A55";

type Row = any;

// NOTE: keep loose typing; /api/funding/terms may return extra fields (la_term_date_id, blocks, etc.)
type Term = {
  id: string;
  name: string;
  nursery_id: string;
  la_start_date: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  la_term_date_id?: string | null;
  blocks?: Array<{ id: string }>;
};

type FundingClientProps = { nurseryIdOverride?: string };

/** existing helpers (unchanged) */
function DocBadge({ abbr, status, onClick }: { abbr:string; status?:string; onClick?:()=>void }) {
  const s = (status || "missing").toLowerCase();
  const map: Record<string, { bg:string; fg:string; br:string }> = {
    verified:{ bg:"#E6F5EE", fg:"#1F7A55", br:"#C9ECD9" },
    pending:{ bg:"#FFF6E5", fg:"#8A5A00", br:"#FFE7BF" },
    requested:{ bg:"#EAF3FF", fg:"#1A56B6", br:"#CFE2FF" },
    review:{ bg:"#EAF3FF", fg:"#1A56B6", br:"#CFE2FF" },
    missing:{ bg:"#FBEAEA", fg:DANGER_RED, br:"#F3C5C5" },
  };
  const c = map[s] || map.missing;
  return <button title={`${abbr}: ${status ?? "missing"}`} onClick={onClick}
    style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:28, height:22, borderRadius:8, marginRight:6, background:c.bg, color:c.fg, border:`1px solid ${c.br}`, fontSize:12, fontWeight:700, cursor:"pointer" }}>{abbr}</button>;
}
function getDocStatus(row:any, label:string){ if(row.docs&&typeof row.docs==="object"){const e=row.docs[label]||row.docs[label.toLowerCase()]||row.docs[label.replace(/\s+/g,"_").toLowerCase()]; if(e&&typeof e==="object") return e.status; if(typeof e==="string") return e;} const key=(k:string)=>String(k).toLowerCase().replace(/\s+/g,"_"); for(const k of [`doc_${key(label)}_status`,`${key(label)}_status`,key(label)]) if(row[k]) return row[k]; return undefined;}
function daysUntil(d:string|Date){const x=typeof d==="string"?new Date(d):d; return Math.floor((x.getTime()-Date.now())/(1000*60*60*24));}
function codeStatus(code?:string|null,validTo?:string|null){ if(!code) return "Pending"; if(!validTo) return "Verified"; const n=daysUntil(validTo); if(n<0) return "Expired"; if(n<=30) return "Expiring Soon"; if(n<=60) return "Verified"; return "Verified";}
function fmt(date?:string|null){ return date?new Date(date).toLocaleDateString("en-GB"):"—";}
function ageAtYM(dobIso?:string|null, laStartIso?:string|null){
  if(!dobIso||!laStartIso) return "—";
  const dob=new Date(dobIso), ref=new Date(laStartIso);
  if(isNaN(dob.getTime())||isNaN(ref.getTime())) return "—";
  let y=ref.getFullYear()-dob.getFullYear();
  let m=ref.getMonth()-dob.getMonth();
  if(ref.getDate()<dob.getDate()) m-=1;
  if(m<0){y-=1; m+=12;}
  return y<0?"—":`${y}Y ${m}M`;
}

/** months between */
function monthsBetween(dobIso?: string|null, refIso?: string|null): number {
  if (!dobIso || !refIso) return -1;
  const d = new Date(dobIso);
  const r = new Date(refIso);
  if (isNaN(d.getTime()) || isNaN(r.getTime())) return -1;
  let y = r.getFullYear() - d.getFullYear();
  let m = r.getMonth() - d.getMonth();
  if (r.getDate() < d.getDate()) m -= 1;
  if (m < 0) { y -= 1; m += 12; }
  return y * 12 + m;
}
function isUnder3Years(dobIso?:string|null, laStartIso?:string|null){
  const m = monthsBetween(dobIso, laStartIso); return m >= 0 && m < 36;
}

/** Pill UI — colour-coded by entitlement type */
function Pill({ text }: { text: "WP15" | "D215" | "U15" | string }) {
  const palette =
    text === "WP15" || text === "WP30"
      ? { bg:"#EAF3FF", br:"#CFE2FF", fg:"#1A56B6" }
      : text === "D215"
      ? { bg:"#FFF6E5", br:"#FFE3B3", fg:"#8A5A00" }
      : text === "U15"
      ? { bg:"#EAF7ED", br:"#CBECD4", fg:GREEN }
      : { bg:"#F3F4F6", br:"#E5E7EB", fg:"#374151" };
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", padding:"2px 8px",
      borderRadius:999, background:palette.bg, border:`1px solid ${palette.br}`,
      color:palette.fg, fontSize:12, fontWeight:600, marginRight:6, marginBottom:4, whiteSpace:"nowrap"
    }}>{text}</span>
  );
}

/** robust readers */
function readWP(row: any): boolean | undefined {
  const v = row?.claim_working_parent ?? row?.working_parent ?? row?.wp ?? row?.wp_claim ?? row?.claim_wp;
  return typeof v === "boolean" ? v : undefined;
}
function readD2(row: any): boolean | undefined {
  const v = row?.claim_disadvantaged2 ?? row?.disadvantaged2 ?? row?.d2 ?? row?.means_tested ?? row?.eligible_two;
  return typeof v === "boolean" ? v : undefined;
}

/** Compute pills + hours from flags at term start (D2+WP for 2s stacks to 30h) */
function computeEntitlementBlocks(
  flags: { WP: boolean; D2: boolean },
  dobIso: string | null,
  laStartIso: string | null
): { pills: string[]; hours: 0 | 15 | 30 } {
  if (!dobIso || !laStartIso) return { pills: [], hours: 0 };

  const ageM = monthsBetween(dobIso, laStartIso);
  if (ageM < 0) return { pills: [], hours: 0 };

  const { WP, D2 } = flags;
  const pills: string[] = [];

  if (ageM < 9 || ageM >= 60) return { pills, hours: 0 };

  if (ageM < 36 && WP && !D2) {
    pills.push("WP30");
    return { pills, hours: 30 };
  }

  if (ageM < 24) {
    if (WP) pills.push("WP15", "WP15");
  } else if (ageM < 36) {
    if (D2 && WP) pills.push("D215", "WP15");
    else if (D2) pills.push("D215");
  } else {
    pills.push("U15");
    if (WP) pills.push("WP15");
  }

  const capped = pills.slice(0, 2);
  return {
    pills: capped,
    hours: (capped.length * 15) as 0 | 15 | 30,
  };
}

/** derive category label from pills */
function categoryFromPills(pills: string[]): "wp" | "u15_only" | "d2" | "not_eligible" {
  const hasWP = pills.some((p) => p.startsWith("WP"));
  const hasU = pills.includes("U15");
  const hasD2 = pills.includes("D215");
  if (hasWP) return "wp";
  if (hasU && !hasWP) return "u15_only";
  if (hasD2 && !hasWP && !hasU) return "d2";
  return "not_eligible";
}
const CATEGORY_LABELS: Record<ReturnType<typeof categoryFromPills>, string> = {
  wp: "Working Parent Entitled",
  u15_only: "Universal Only",
  d2: "Disadvantaged 2s",
  not_eligible: "Not Eligible For Funding",
};

function parseSeasonFromLabel(label: string | null | undefined): "Autumn" | "Spring" | "Summer" | null {
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
function normISO(s?: string | null): string | null {
  if (!s) return null;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}
function academicYearFromStartDate(startIso: string | null): string | null {
  const s = normISO(startIso);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan
  const startYear = month >= 8 ? year : year - 1;
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

export default function FundingClient({ nurseryIdOverride }: FundingClientProps = {}) {
  const { nurseryId } = useScope();
  const effectiveNurseryId = nurseryIdOverride || nurseryId;

  const searchParams = useSearchParams();
  const termIdFromQuery = searchParams.get("term_id") || "";

  const { orgName, nurseries } = useOrgMeta();
  const currentNurseryName =
    nurseries.find((n) => n.id === effectiveNurseryId)?.name ?? "Nursery";

  const [termName, setTermName] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [loadingTerms, setLoadingTerms] = useState(true);

  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<string[]>([]);
  const [banner, setBanner] = useState<string|null>(null);

  const [declByChildId, setDeclByChildId] = useState<
    Record<string, { status: string; decl_id: string; term_id: string }>
  >({});

// Load declaration status (and declaration id) for the selected term_id
useEffect(() => {
  if (!effectiveNurseryId || !termIdFromQuery) {
    setDeclByChildId({});
    return;
  }

  let cancelled = false;

  // pick the "best" declaration status if multiple exist per child
  const rankStatus = (s: string): number => {
    const v = String(s ?? "").toLowerCase().trim();
    if (v === "signed" || v === "approved") return 300;
    if (v === "pending" || v === "sent" || v === "review" || v === "pending_review") return 200;
    if (v === "attention" || v === "rejected" || v === "declined") return 150;
    if (v === "superseded") return 10;
    if (!v || v === "missing") return 0;
    return 50;
  };

  (async () => {
    try {
      const params = new URLSearchParams();
      params.set("nursery_id", effectiveNurseryId);
      params.set("term_id", termIdFromQuery);

      const res = await fetch(`/api/org/declarations?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const j = await res.json().catch(() => ({} as any));
      if (cancelled) return;

      const items = Array.isArray(j?.items) ? j.items : [];

      const best: Record<string, { status: string; decl_id: string; term_id: string; rank: number }> = {};

      for (const it of items) {
        // IMPORTANT: DeclarationsClient expects `child` object, not `child_id` at top-level. :contentReference[oaicite:3]{index=3}
        const childId =
          String(it?.child?.id ?? it?.child_id ?? it?.childId ?? "");
        const declId =
          String(it?.id ?? it?.declaration_id ?? "");

        if (!childId || !declId) continue;

        const st = String(it?.status ?? "missing");
        const r = rankStatus(st);

        const prev = best[childId];
        if (!prev || r > prev.rank) {
          best[childId] = { status: st, decl_id: declId, term_id: termIdFromQuery, rank: r };
        }
      }

      const out: Record<string, { status: string; decl_id: string; term_id: string }> = {};
      for (const [childId, v] of Object.entries(best)) {
        out[childId] = { status: v.status || "missing", decl_id: v.decl_id, term_id: v.term_id };
      }

      setDeclByChildId(out);
    } catch {
      if (!cancelled) setDeclByChildId({});
    }
  })();

  return () => {
    cancelled = true;
  };
}, [effectiveNurseryId, termIdFromQuery]);

  /** cache flags from /api/children/[id] if missing on rows */
  const [claimCache, setClaimCache] = useState<Record<string, {WP:boolean; D2:boolean}>>({});

  function resolveSelectedTerm(
  list: Term[],
  termIdFromUrl: string,
  urlTermName: string
): Term | null {
  if (!list.length) return null;

  // 1) Prefer LA block anchor id from sidebar (term_id is la_term_dates.id)
  if (termIdFromUrl) {
    // If API ever returns la_term_dates.id directly as term.id
    const direct = list.find((t) => t.id === termIdFromUrl);
    if (direct) return direct;

    // NEW: seasonal anchor id returned by /api/funding/terms
    const byAnchor = list.find(
      (t) => String((t as any).anchor_la_term_date_id ?? "") === termIdFromUrl
    );
    if (byAnchor) return byAnchor;

    // Backward-compat: if API returns la_term_date_id
    const byLa = list.find(
      (t) =>
        String((t as any).la_term_date_id ?? "") === termIdFromUrl ||
        String((t as any).la_term_dates_id ?? "") === termIdFromUrl
    );
    if (byLa) return byLa;

    // Seasonal terms may expose underlying block ids
    const byBlocks = list.find(
      (t) =>
        Array.isArray((t as any).blocks) &&
        (t as any).blocks.some(
          (b: any) => String(b?.id ?? "") === termIdFromUrl
        )
    );
    if (byBlocks) return byBlocks;
  }

  // 2) Optional legacy URL param (?term_name=...)
  if (urlTermName) {
    const wanted = urlTermName.trim().toLowerCase();
    const byName = list.find((t) => (t.name || "").toLowerCase() === wanted);
    if (byName) return byName;
  }

  // 3) Fallback to current/first
  const cur = list.find((t) => !!(t as any).is_current);
  return cur ?? list[0] ?? null;
}

function getDeclarationForRow(r: any): { status: string; decl_id: string; term_id: string } | null {
  const childId = String(r.child_id ?? r.id ?? "");
  if (childId && declByChildId[childId]) return declByChildId[childId];
  return null;
}

function DeclPill({ status, onClick }: { status: string; onClick?: () => void }) {
  const s = String(status || "missing").toLowerCase().trim();

  let label = "Missing";
  let bg = "#FBEAEA";
  let br = "#F3C5C5";
  let fg = "#8A1F1F";

  if (["signed", "approved"].includes(s)) {
    label = "Signed";
    bg = "#E6F5EE";
    br = "#C9ECD9";
    fg = "#1F7A55";
  } else if (["pending", "sent", "review", "pending_review"].includes(s)) {
    label = "Pending";
    bg = "#FFF6E5";
    br = "#FFE7BF";
    fg = "#8A5A00";
  } else if (["rejected", "declined", "attention"].includes(s)) {
    label = "Needs attention";
    bg = "#FBEAEA";
    br = "#F3C5C5";
    fg = "#8A1F1F";
  } else if (s === "superseded") {
    label = "Superseded";
    bg = "#F3F4F6";
    br = "#E5E7EB";
    fg = "#374151";
  } else if (s && s !== "missing") {
    label = s.charAt(0).toUpperCase() + s.slice(1);
    bg = "#F3F4F6";
    br = "#E5E7EB";
    fg = "#374151";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Declaration: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${br}`,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

  function extractSeason(label: string): "Autumn" | "Spring" | "Summer" | null {
  const t = String(label ?? "");
  if (/autumn/i.test(t)) return "Autumn";
  if (/spring/i.test(t)) return "Spring";
  if (/summer/i.test(t)) return "Summer";
  const m = t.match(/\((autumn|spring|summer)\)/i);
  if (m?.[1]) {
    const s = m[1].toLowerCase();
    return s === "autumn" ? "Autumn" : s === "spring" ? "Spring" : "Summer";
  }
  return null;
}

function academicYearFromStartDate(startIso?: string | null): string | null {
  if (!startIso) return null;
  const d = new Date(String(startIso).slice(0, 10));
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan, 8=Sep
  const startYear = month >= 8 ? year : year - 1;
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

function norm(s: string) {
  return String(s ?? "").trim().toLowerCase();
}

async function loadTerms(termIdFromUrl?: string) {
  if (!effectiveNurseryId) {
    setTerms([]);
    setTermName("");
    setSelectedTerm(null);
    setLoadingTerms(false);
    return;
  }

  try {
    setLoadingTerms(true);
    setBanner(null);

    const url = new URL("/api/funding/terms", window.location.origin);
    url.searchParams.set("nursery_id", effectiveNurseryId);
    url.searchParams.set("all", "1");

    const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setTerms([]);
      setTermName("");
      setSelectedTerm(null);
      setBanner(json?.error || "Failed to load terms");
      return;
    }

    const list: Term[] = Array.isArray(json?.terms) ? json.terms : [];

    const urlTermName = new URL(window.location.href).searchParams.get("term_name") ?? "";
    let picked = resolveSelectedTerm(list, termIdFromUrl ?? "", urlTermName);

    // IMPORTANT: fallback resolver when /api/funding/terms does not expose la_term_date_id/blocks
    if (!picked && termIdFromUrl) {
      try {
        const declUrl = new URL("/api/org/declarations", window.location.origin);
        declUrl.searchParams.set("nursery_id", effectiveNurseryId);

        const r2 = await fetch(declUrl.toString(), { cache: "no-store", credentials: "include" });
        const j2 = await r2.json().catch(() => ({}));

        const laTerms = Array.isArray(j2?.terms) ? j2.terms : [];
        const anchor = laTerms.find((t: any) => String(t?.id ?? "") === String(termIdFromUrl)) ?? null;

        if (anchor) {
          const season = extractSeason(String(anchor.label ?? anchor.name ?? ""));
          const ay = academicYearFromStartDate(anchor.start_date ?? null);
          const wanted = season && ay ? `${season} ${ay}` : String(anchor.label ?? "");

          // Match by full label first, then by season+AY fragments
          picked =
            list.find((t: any) => norm(t.name) === norm(wanted)) ||
            (season && ay
              ? list.find((t: any) => norm(t.name).includes(norm(season)) && norm(t.name).includes(norm(ay)))
              : null) ||
            picked;
        }
      } catch {
        // ignore; keep picked as null
      }
    }

    setTerms(list);
    setSelectedTerm(picked);
    setTermName(picked?.name ?? "");
  } finally {
    setLoadingTerms(false);
  }
}

  async function load() {
    if (!effectiveNurseryId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const url = new URL("/api/funding/table", window.location.origin);
      url.searchParams.set("nursery_id", effectiveNurseryId);

      // keep existing API behaviour: term_name parameter
      if (termName) url.searchParams.set("term_name", termName);

      if (q.trim()) url.searchParams.set("q", q.trim());
      if (includeArchived) url.searchParams.set("include_archived", "1");

      const res = await fetch(url.toString(), { cache:"no-store", credentials:"include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setRows([]); setBanner(json?.error || "Failed to load rows"); return; }
      setRows(Array.isArray(json?.items) ? json.items : []); setSelected([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (effectiveNurseryId) loadTerms(termIdFromQuery); }, [effectiveNurseryId, termIdFromQuery]);
  useEffect(() => { if (effectiveNurseryId) load(); }, [effectiveNurseryId, termName, includeArchived]);

  /** fetch missing claim flags per child (once) */
useEffect(() => {
  const laStartIsoLocal =
    selectedTerm?.la_start_date ??
    selectedTerm?.start_date ??
    terms.find((t) => t.name === termName)?.la_start_date ??
    terms.find((t) => t.name === termName)?.start_date ??
    null;

  if (!rows.length || !laStartIsoLocal) return;

  const toFetch = new Set<string>();

  for (const r of rows) {
    const id = r.child_id ?? r.id;
    const wpt = readWP(r);
    const d2t = readD2(r);

    if (
      typeof id === "string" &&
      (wpt === undefined || d2t === undefined) &&
      !claimCache[id]
    ) {
      toFetch.add(id);
    }
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
          // ignore individual fetch failures
        }
      })
    );

    if (!cancelled && Object.keys(entries).length) {
      setClaimCache((prev) => ({ ...prev, ...entries }));
    }
  })();

  return () => {
    cancelled = true;
  };
}, [rows, termName, terms, selectedTerm, claimCache]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r:any) =>
      (r.child_name ?? "").toString().toLowerCase().includes(t) ||
      (r.code ?? r.funding_code ?? "").toString().toLowerCase().includes(t)
    );
  }, [rows, q]);

  function toggle(id:string){ setSelected(cur => cur.includes(id) ? cur.filter(x=>x!==id) : [...cur,id]); }

  async function requestCodeUpdateForSelected(){ if(selected.length===0){ alert("Select one or more children first."); return; }
    await fetch("/api/funding/request-code-updates",{ method:"POST", headers:{ "Content-Type":"application/json" }, credentials:"include", body:JSON.stringify({ child_ids:selected, notify:true })})
      .then(async r=>{ if(!r.ok){ const j=await r.json().catch(()=>null); throw new Error(j?.error||"Failed to request updates");}})
      .catch(e=>alert(e.message)); }
  async function requestByExpiryDays(){ const n=prompt("Request updates for codes expiring within how many days? (e.g. 60)"); if(n==null) return; const d=parseInt(n,10); if(isNaN(d)||d<0){ alert("Please enter a valid number."); return; }
    await fetch("/api/funding/request-code-updates",{ method:"POST", headers:{ "Content-Type":"application/json" }, credentials:"include", body:JSON.stringify({ expiry_within_days:d, nursery_id:effectiveNurseryId, notify:true })})
      .then(async r=>{ if(!r.ok){ const j=await r.json().catch(()=>null); throw new Error(j?.error||"Failed to request updates");}})
      .catch(e=>alert(e.message)); }

  function exportCsv(){ /* unchanged … keep your existing implementation */ }

  const laStartIso = useMemo(() => {
  const t = selectedTerm ?? terms.find((tt) => tt.name === termName) ?? null;
  return t?.la_start_date ?? t?.start_date ?? null;
}, [terms, termName, selectedTerm]);

  const termLabel = useMemo(() => {
    const t = selectedTerm ?? terms.find(tt => tt.name === termName) ?? null;
    if (!t) return termName || "";
    const season = parseSeasonFromLabel(t.name);
    const ay = academicYearFromStartDate(t.la_start_date ?? t.start_date ?? null);
    if (season && ay) return `${season} ${ay}`;
    return t.name || termName || "";
  }, [selectedTerm, terms, termName]);

  function renderExpiryCell(validTo?:string|null){
    if(!validTo) return "—";
    const d=new Date(validTo);
    const n=daysUntil(d);
    const text=d.toLocaleDateString("en-GB");
    let color: string|undefined;
    if(n<=30&&n>=0) color=DANGER_RED;
    else if(n<=60&&n>30) color="#8A5A00";
    else if(n<0) color=DANGER_RED;
    return <span style={{ color }}>{text}</span>;
  }

  /** merge flags for a row */
  function flagsForRow(r:any): {WP:boolean; D2:boolean} {
    const id = r.child_id ?? r.id;
    const wpt = readWP(r);
    const d2t = readD2(r);
    const cached = (typeof id === "string" && claimCache[id]) ? claimCache[id] : undefined;
    return {
      WP: (wpt !== undefined ? wpt : cached?.WP) ?? false,
      D2: (d2t !== undefined ? d2t : cached?.D2) ?? false,
    };
  }

  /** Build grouped buckets */
  const grouped = useMemo(() => {
    const buckets: Record<ReturnType<typeof categoryFromPills>, any[]> = {
      wp: [], u15_only: [], d2: [], not_eligible: [],
    };
    for (const r of filtered) {
      const flags = flagsForRow(r);
      const dobIso = r.date_of_birth ?? null;
      const { pills, hours } = computeEntitlementBlocks(flags, dobIso, laStartIso);
      const cat = categoryFromPills(pills);
      buckets[cat].push({ r, pills, hours });
    }
    return buckets;
  }, [filtered, laStartIso, claimCache]);

  const sectionOrder: Array<keyof typeof grouped> = ["wp","u15_only","d2","not_eligible"];

  return (
    <div style={{ display:"grid", gap:12 }}>
      {banner && (
        <div style={{ background:"#FFF8E6", border:"1px solid #F2D27A", color:"#6A4A0C", padding:8, borderRadius:8 }}>
          {banner}
        </div>
      )}
      <OrgContextStrip
        orgName={orgName}
        nurseryName={currentNurseryName}
        termLabel={termLabel}
      />

      {/* Toolbar */}
      <div style={{ ...card, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by child name or code" style={{ ...inputCss, minWidth:320, flex:1 }} />
        <button onClick={load} style={btn}>Search</button>

        <label style={{ display:"inline-flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e)=>setIncludeArchived(e.target.checked)} />
          Include archived
        </label>

        <button onClick={exportCsv} style={btn}>Export CSV</button>
        <button onClick={requestCodeUpdateForSelected} style={btn}>Request update (selected)</button>
        <button onClick={requestByExpiryDays} style={btn}>Request by expiry…</button>

        <span style={{ marginLeft:8, color:"#6B7280" }}>{selected.length ? `${selected.length} selected` : ""}</span>
      </div>

      {/* Table */}
      <div style={{ ...card, padding:0 }}>
        <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
          <thead>
            <tr>
              <th style={{ ...th, width:36 }}></th>
              <th style={th}>Child Name</th>
              <th style={th}>Date of Birth</th>
              <th style={th}>Doc Status</th>
              <th style={th}>Declaration</th>
              <th style={th}>Funding Code</th>
              <th style={th}>Valid From</th>
              <th style={th}>Expiry</th>
              <th style={th}>Applicant NI Number</th>
              <th style={th}>Entitlements</th>
              <th style={th}>Funded Hours/week</th>
              <th style={th}>Age at Term Start Date</th>
              <th style={th}>Stretch</th>
              <th style={th}>Funding Code Status</th>
              <th style={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {/* unchanged rendering below */}
            {loading ? (
              <tr><td colSpan={15} style={{ padding:14, opacity:0.7 }}>Loading…</td></tr>
            ) : sectionOrder.every(k => grouped[k].length === 0) ? (
              <tr><td colSpan={15} style={{ padding:14, opacity:0.7 }}>No records.</td></tr>
            ) : (
              sectionOrder.map((key) => {
                const section = grouped[key];
                if (!section.length) return null;
                return (
                  <FragmentSection key={key} title={`${CATEGORY_LABELS[key]} — ${section.length}`}>
                    {section.map(({ r, pills, hours }: any) => {
                      const id = r.child_id ?? r.id;
                      const name = r.child_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—";
                      const dobIso = r.date_of_birth ?? null;
                      const dobDisp = dobIso ? new Date(dobIso).toLocaleDateString("en-GB") : "—";
                      const code = r.code ?? r.funding_code ?? null;
                      const validFrom = r.code_valid_from ?? r.funding_valid_from ?? null;
                      const validTo   = r.code_valid_to   ?? r.funding_valid_to   ?? null;
                      const ni  = r.applicant_ni_number ?? r.ni_number ?? null;
                      const str = r.stretch;
                      const fcStatus = codeStatus(code, validTo);

                      const needCode = pills.some((p) => p.startsWith("WP"));

                      let codeCell: React.ReactNode = code ?? "—";
                      if (!needCode) {
                        codeCell = (
                          <span style={{ color: GREEN, fontStyle: "italic" }}>
                            {" "}– Not required –
                          </span>
                        );
                      } else if (!code) {
                        codeCell = (
                          <span style={{ color: DANGER_RED, fontWeight: 700 }}>
                            Required
                          </span>
                        );
                      }

                      const ageStr = ageAtYM(dobIso, laStartIso);
                      const ageDanger = hours >= 30 && isUnder3Years(dobIso, laStartIso);
                      const decl = getDeclarationForRow(r);
                      const declStatus = decl?.status ?? "missing";
                      const declHref = decl?.decl_id
                        ? `/org/declarations?term_id=${encodeURIComponent(termIdFromQuery)}&open=${encodeURIComponent(decl.decl_id)}`
                        : `/org/declarations?term_id=${encodeURIComponent(termIdFromQuery)}&q=${encodeURIComponent(name)}`;

                      return (
                        <tr key={id ?? name} style={{ borderTop:"1px solid #F2F1EE" }}>
                          <td style={{ padding:10 }}>
                            <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} />
                          </td>
                          <td style={{ padding:10 }}>{name}</td>
                          <td style={{ padding:10 }}>{dobDisp}</td>
                          <td style={{ padding:10, whiteSpace:"nowrap" }}>
                            <DocBadge abbr="BC" status={getDocStatus(r,"Birth certificate")} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                            <DocBadge abbr="PA" status={getDocStatus(r,"Proof of address")}  onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                            <DocBadge abbr="FC" status={getDocStatus(r,"Funding code letter")} onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                            <DocBadge abbr="ID" status={getDocStatus(r,"Proof of ID")}        onClick={() => (window.location.href = `/org/documents?q=${encodeURIComponent(name)}`)} />
                          </td>
                          <td style={{ padding: 10 }}>
                           <DeclPill
                             status={declStatus}
                             onClick={() => (window.location.href = declHref)}
                           />
                          </td>
                          <td style={{ padding:10 }}>{codeCell}</td>
                          <td style={{ padding:10 }}>{fmt(validFrom)}</td>
                          <td style={{ padding:10 }}>{renderExpiryCell(validTo)}</td>
                          <td style={{ padding:10 }}>{ni ?? "—"}</td>
                          <td style={{ padding:10 }}>
                            {pills.length === 0 ? "—" : pills.map((p:string, i:number) => <Pill key={`${p}-${i}`} text={p as any} />)}
                          </td>
                          <td style={{ padding:10 }}>{hours || 0}</td>
                          <td style={{ padding:10, color: ageDanger ? DANGER_RED : undefined }}>{ageStr}</td>
                          <td style={{ padding:10 }}>{str === true ? "Y" : str === false ? "N" : "—"}</td>
                          <td style={{ padding:10 }}>{fcStatus}</td>
                          <td style={{ padding:10 }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
                        </tr>
                      );
                    })}
                  </FragmentSection>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={15} style={{ background:"#FAFAF9", borderTop:"1px solid #EEE", borderBottom:"1px solid #EEE", padding:"10px 12px", fontWeight:800 }}>
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
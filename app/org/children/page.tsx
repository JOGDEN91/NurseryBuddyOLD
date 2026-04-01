"use client";

import { useEffect, useMemo, useRef, useState, useId } from "react";
import { createClient } from "@supabase/supabase-js";
import { useScope } from "@/components/scope/ScopeProvider";
import ChildConsumablesClient, { hoursToBand } from "./_components/ChildConsumablesClient";

/* ---------- types ---------- */
type ChildRow = {
  id?: string;
  nursery_id?: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: "onboarding" | "active" | "archived" | null;
  status_live?: "onboarding" | "active" | "archived" | null;

  single_parent?: boolean | null;

  parent1_name?: string | null;
  parent1_email?: string | null;
  parent_phone?: string | null; // keep single contact number
  parent1_nis?: string | null;
  parent1_dob?: string | null;

  parent2_name?: string | null;
  parent2_email?: string | null;
  parent2_nis?: string | null;
  parent2_dob?: string | null;

  address_line1?: string | null;
  address_line2?: string | null;
  town?: string | null;
  postcode?: string | null;

  gender?: "f" | "m" | null;
  ethnicity?: string | null;
  notes?: string | null;

  /** legacy: still stored but no longer edited here */
  funded_hours_per_week?: number | null;
  /** legacy: no longer shown here (nursery-specific in org/settings) */
  stretch?: boolean | null;

  hours_mon?: number | null;
  hours_tue?: number | null;
  hours_wed?: number | null;
  hours_thu?: number | null;
  hours_fri?: number | null;

  /** NEW: profile claim selections (feed resolver elsewhere) */
  claim_working_parent?: boolean | null;
  claim_disadvantaged2?: boolean | null;
};

type FundingCode = {
  id?: string;
  child_id: string;
  code: string | null;
  status: "pending" | "renewal_due" | "submitted" | "verified" | "expired";
  valid_from: string | null;
  expiry_date: string | null;
};

/* ---------- supabase client (for funding_codes read/write) ---------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ---------- styles ---------- */
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 12 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff" };
const inputSm: React.CSSProperties = { padding: "6px 8px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", height: 32, fontSize: 13 };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #4CAF78", background: "#4CAF78", color: "#fff", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff", color: "#24364B", fontWeight: 700, cursor: "pointer" };

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  let bg = "#E0E0E0", color = "#24364B";
  if (s === "active") { bg = "#4CAF78"; color = "#fff"; }
  else if (s === "onboarding") { bg = "#FFC107"; color = "#24364B"; }
  else if (s === "archived") { bg = "#E53935"; color = "#fff"; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, lineHeight: 1.6, background: bg, color }}>
      {status ?? "—"}
    </span>
  );
}

const fmt = (d?: string | null) => (d ? d.slice(0,10).split("-").reverse().join("-") : "—");
const toISO = (s?: string | null) => (s ? s.slice(0,10) : "");

function isPastDate(ymd?: string | null) {
  if (!ymd) return false;
  const [y, m, d] = ymd.slice(0,10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const t = new Date(); const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const endUTC = Date.UTC(y, m-1, d);
  return endUTC < todayUTC;
}
function statusFromDates(start_date?: string | null, end_date?: string | null): "onboarding" | "active" | "archived" {
  if (end_date && isPastDate(end_date)) return "archived";
  if (!start_date) return "onboarding";
  const [y,m,d] = start_date.slice(0,10).split("-").map(Number);
  const t = new Date();
  const todayUTC = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const sUTC = Date.UTC(y, (m??1)-1, d??1);
  return sUTC > todayUTC ? "onboarding" : "active";
}

function normYMD(s?: string | null) {
  if (!s) return null;
  const v = String(s).slice(0, 10); // yyyy-mm-dd
  return v && v !== "0000-00-00" ? v : null;
}

function totalHours(c?: ChildRow | null) {
  if (!c) return 0;
  const vals = [c.hours_mon, c.hours_tue, c.hours_wed, c.hours_thu, c.hours_fri].map(v => (typeof v === "number" ? v : 0));
  return vals.reduce((a,b)=>a+b,0);
}

/* ---------- page ---------- */
export default function OrgChildrenPage() {
  const { nurseryId } = useScope();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // modal state
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [child, setChild] = useState<ChildRow | null>(null);
  const [fCode, setFCode] = useState<FundingCode | null>(null);

  // Phone UI state for the modal (kept separate so we can compose E.164 on save)
  const [phoneCountry, setPhoneCountry] = useState<string>("+44"); // default UK
  const [phoneLocal, setPhoneLocal] = useState<string>("");

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function loadList() {
    if (!nurseryId) { setRows([]); return; }
    setLoading(true);
    try {
      const url = new URL("/api/children", window.location.origin);
      url.searchParams.set("nursery_id", nurseryId);
      if (includeArchived) url.searchParams.set("include_archived", "1");
      const r = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      setRows(Array.isArray(j?.children) ? j.children : []);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [nurseryId, includeArchived]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return rows;
    return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(t) ||
      (r.parent_name ?? "").toLowerCase().includes(t) ||
      (r.parent_email ?? "").toLowerCase().includes(t) ||
      (r.postcode ?? "").toLowerCase().includes(t) ||
      (r.notes ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  // ----- helpers for phone normalisation -----
  function parsePhone(e164?: string | null) {
    if (!e164) return { cc: "+44", local: "" };
    const s = e164.trim();
    if (s.startsWith("+")) {
      const m = s.match(/^\+(\d{1,4})(.*)$/);
      if (m) {
        const cc = `+${m[1]}`;
        const rest = (m[2] || "").trim();
        return { cc, local: rest };
      }
    }
    return { cc: "+44", local: s };
  }
  function composePhone(cc: string, local: string) {
    const raw = (local || "").trim();
    if (!raw) return null;
    if (raw.startsWith("+")) return raw; // user pasted E.164
    const digits = raw.replace(/[^\d]/g, "");
    const national = digits.startsWith("0") ? digits.slice(1) : digits;
    return `${cc}${national}`;
  }

  // ----- open EDIT -----
  async function openEdit(id: string) {
    setIsNew(false);
    setEditOpen(true);
    setSaving(false);
    setBanner(null);
    setChild(null); setFCode(null);

    try {
      // Use API GET that returns all fields
      const res = await fetch(`/api/children/${id}`, { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Could not load child (${res.status})`);
      }
      const j = await res.json();
      const base: ChildRow = j.child;
            const normalized: ChildRow = {
        ...base,
        date_of_birth: toISO(base.date_of_birth),
        start_date: toISO(base.start_date),
        end_date: toISO(base.end_date),
        parent1_dob: toISO((base as any).parent1_dob),
        parent2_dob: toISO((base as any).parent2_dob),
        // default new fields safely if absent
        claim_working_parent:
          typeof base.claim_working_parent === "boolean"
            ? base.claim_working_parent
            : false,
        claim_disadvantaged2:
          typeof base.claim_disadvantaged2 === "boolean"
            ? base.claim_disadvantaged2
            : false,
      };
      setChild(normalized);

      // initialise phone controls from existing value
      const { cc, local } = parsePhone(base.parent_phone);
      setPhoneCountry(cc);
      setPhoneLocal(local);

      // latest funding code
      const { data: codes } = await supabase
        .from<FundingCode>("funding_codes")
        .select("*")
        .eq("child_id", id)
        .order("created_at" as any, { ascending: false })
        .limit(1);
      if (codes && codes.length) setFCode({ ...codes[0], valid_from: toISO(codes[0].valid_from) });
      else setFCode({ child_id: id, code: "", status: "pending", valid_from: null, expiry_date: null });
    } catch (e: any) {
      setBanner(e?.message || "Failed to load child");
    }
  }

async function sendParentInviteIfNeeded(childId: string | undefined | null, parentEmail: string | null | undefined) {
  if (!childId) return;
  const email = (parentEmail || "").trim();
  if (!email) return;

  try {
    await fetch("/api/parent/invite", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child_id: childId }),
    });
    // We don't block on errors here; they'll appear in /org/requests if the insert worked.
  } catch (err) {
    console.error("parent invite failed:", err);
  }
}

  // ----- open ADD (blank) -----
  async function openAdd() {
    if (!nurseryId) return;
    setIsNew(true);
    setEditOpen(true);
    setSaving(false);
    setBanner(null);

    setChild({
      nursery_id: nurseryId,
      first_name: "",
      last_name: "",
      date_of_birth: "",
      start_date: "",
      end_date: "",
      status: "onboarding",
      single_parent: false,
      parent1_name: "",
      parent1_email: "",
      parent_phone: "",
      parent1_nis: "",
      parent1_dob: "",
      parent2_name: "",
      parent2_email: "",
      parent2_nis: "",
      parent2_dob: "",
      address_line1: "",
      address_line2: "",
      town: "",
      postcode: "",
      gender: null,
      ethnicity: "",
      notes: "",
      funded_hours_per_week: null,
      stretch: null,
      hours_mon: null, hours_tue: null, hours_wed: null, hours_thu: null, hours_fri: null,
      claim_working_parent: false,
      claim_disadvantaged2: false,
    });

    setPhoneCountry("+44");
    setPhoneLocal("");

    setFCode({ child_id: "__pending__", code: "", status: "pending", valid_from: null, expiry_date: null });
  }

  // setters
  function setChildField<K extends keyof ChildRow>(k: K, v: any) { setChild(c => c ? ({ ...c, [k]: v }) : c); }
  function setFCodeField<K extends keyof FundingCode>(k: K, v: any) { setFCode(fc => fc ? ({ ...fc, [k]: v }) : fc); }

  // ----- save -----
  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    if (!child) return;
    setSaving(true);
    setBanner(null);

    try {
      // --- normalize dates first
      const dob = normYMD(child.date_of_birth);
      const start = normYMD(child.start_date);
      const end = normYMD(child.end_date);

      if (!dob) {
        setSaving(false);
        setBanner("Please enter the child's date of birth (required).");
        return;
      }

      const payload: any = {
        ...child,

        // keep both names so server/DB are happy
        date_of_birth: dob,
        dob, // <-- matches DB column

        start_date: start,
        end_date: end,

        status: statusFromDates(start, end),

        // LEGACY fields preserved (not edited here)
        funded_hours_per_week: child.funded_hours_per_week ?? null,
        stretch: child.stretch ?? null,

        parent1_nis: (child.parent1_nis ?? "") || null,
        parent2_nis: (child.parent2_nis ?? "") || null,
        parent1_dob: normYMD(child.parent1_dob),
        parent2_dob: normYMD(child.parent2_dob),
        single_parent: !!child.single_parent,
        ethnicity: (child.ethnicity ?? "") || null,

        hours_mon: child.hours_mon ?? null,
        hours_tue: child.hours_tue ?? null,
        hours_wed: child.hours_wed ?? null,
        hours_thu: child.hours_thu ?? null,
        hours_fri: child.hours_fri ?? null,

        // NEW: profile selection booleans
        claim_working_parent: !!child.claim_working_parent,
        claim_disadvantaged2: !!child.claim_disadvantaged2,

        // phone
        parent_phone: composePhone(phoneCountry, phoneLocal),
      };

      let savedId = child.id;

      if (isNew) {
        const url = new URL("/api/children", window.location.origin);
        if (child.nursery_id) url.searchParams.set("nursery_id", child.nursery_id);
        const r = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        const ok = r.ok;
        const j = await r.json().catch(() => ({}));
        if (!ok) throw new Error(j?.error || "Could not add child");
        savedId = j?.id;
      } else {
        const r = await fetch(`/api/children/${child.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        const ok = r.ok;
        const j = await r.json().catch(() => ({}));
        if (!ok) throw new Error(j?.error || "Could not save child");
        savedId = child.id!;
      }

      // If this is a brand new child and we have a parent email,
      // create a parent_invite request and link the parent.
      if (isNew) {
        await sendParentInviteIfNeeded(savedId, child.parent_email ?? payload.parent_email);
      }

      // funding code handling unchanged…
      if (fCode && savedId) {
        const fcPayload = {
          child_id: savedId,
          code: fCode.code || null,
          status: fCode.status || "pending",
          valid_from: fCode.valid_from || null,
          expiry_date: fCode.expiry_date || null,
        };
        const { error: fcErr } = await supabase.from("funding_codes").upsert(fcPayload as any);
        if (fcErr) {
          console.error("Funding code upsert error:", fcErr);
          setBanner("Child saved, but funding code failed to save (RLS?).");
        }
      }

      setEditOpen(false);
      setIsNew(false);
      await loadList();
    } catch (err: any) {
      setBanner(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- CSV import ---------- */

  function openImport() {
    fileRef.current?.click();
  }

  function parseCSV(text: string): Array<Record<string,string>> {
    // Lightweight CSV parser (handles quoted cells)
    const rows: string[] = [];
    let cur = "", inQ = false;
    for (let i=0; i<text.length; i++) {
      const ch = text[i], next = text[i+1];
      if (ch === '"' ) {
        if (inQ && next === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === '\n' && !inQ) { rows.push(cur); cur = ""; }
      else cur += ch;
    }
    if (cur) rows.push(cur);

    const header = (rows.shift() || "").split(",").map(h => h.trim().toLowerCase());
    return rows
      .filter(r => r.trim().length > 0)
      .map(line => {
        const cells: string[] = [];
        let c = "", q = false;
        for (let i=0; i<line.length; i++) {
          const ch = line[i], next = line[i+1];
          if (ch === '"') {
            if (q && next === '"') { c += '"'; i++; }
            else q = !q;
          } else if (ch === ',' && !q) { cells.push(c); c = ""; }
          else c += ch;
        }
        cells.push(c);
        const rec: Record<string,string> = {};
        header.forEach((h, idx) => { rec[h] = (cells[idx] ?? "").trim(); });
        return rec;
      });
  }

  function toBool(v: string) {
    const t = v.trim().toLowerCase();
    if (["y","yes","true","1"].includes(t)) return true;
    if (["n","no","false","0"].includes(t)) return false;
    return null;
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow reselecting same file
    if (!file || !nurseryId) return;

    try {
      setImporting(true);
      const text = await file.text();
      const records = parseCSV(text);
      if (!records.length) { alert("No rows found in CSV."); return; }

      // Map each record to our payload and POST (keeps existing behaviour)
      let okCount = 0, failCount = 0;
      for (const r of records) {
        const get = (k: string) => r[k] ?? r[k.replace(/\s+/g,"_")] ?? "";
        const num = (k: string) => {
          const v = get(k); const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const date = (k: string) => {
          const v = get(k);
          if (!v) return null;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
            const [dd,mm,yy]=v.split("/"); return `${yy}-${mm}-${dd}`;
          }
          return v.slice(0,10);
        };

        const payload: any = {
          nursery_id: nurseryId,
          first_name: get("first_name") || get("first") || get("given") || "",
          last_name:  get("last_name")  || get("last")  || get("surname") || "",
          date_of_birth: date("date_of_birth") || date("dob"),
          start_date:    date("start_date"),
          end_date:      date("end_date"),

          parent_name:  get("parent_name"),
          parent_email: get("parent_email"),
          parent_nis:   get("parent_nis") || get("ni") || get("nin"),
          ethnicity: get("ethnicity") || null,

          funded_hours_per_week: num("funded_hours_per_week"),
          stretch: toBool(get("stretch")),

          hours_mon: num("hours_mon"),
          hours_tue: num("hours_tue"),
          hours_wed: num("hours_wed"),
          hours_thu: num("hours_thu"),
          hours_fri: num("hours_fri"),

          // NEW CSV columns (optional; safe if missing)
          claim_working_parent: toBool(get("claim_working_parent")),
          claim_disadvantaged2: toBool(get("claim_disadvantaged2")),
        };

        // derive status
        payload.status = statusFromDates(payload.start_date, payload.end_date);

        // skip empty name rows
        if (!payload.first_name && !payload.last_name) continue;

        const url = new URL("/api/children", window.location.origin);
        url.searchParams.set("nursery_id", nurseryId);
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (res.ok) okCount++; else failCount++;
      }

      await loadList();
      alert(`Import complete: ${okCount} added${failCount ? `, ${failCount} failed` : ""}.`);
    } catch (err:any) {
      console.error("Import error:", err);
      alert("Import failed: " + (err?.message || "Unknown error"));
    } finally {
      setImporting(false);
    }
  }

  /* ---------- UI ---------- */
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* top bar */}
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={openAdd}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span> Add child
        </button>

        {/* Import CSV */}
        <button style={btnGhost} onClick={openImport} disabled={!nurseryId || importing}>
          {importing ? "Importing…" : "Import CSV"}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleImportFile} />

        <div style={{ width: 8 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, parent, email, postcode, or notes…"
          style={{ ...input, minWidth: 320, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived children
        </label>
      </div>

      {/* table */}
      <div style={{ ...card, padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>First Name</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Surname</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>DOB</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Parent Name</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Parent Email</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Attended Hours / Week</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Start Date</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>End Date</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 14, opacity: 0.7 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 14, opacity: 0.7 }}>No children.</td></tr>
            ) : filtered.map((r) => {
              const live = r.status_live ?? r.status;
              return (
                <tr key={r.id}
                    onMouseEnter={() => setHoverId(r.id!)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => openEdit(r.id!)}
                    style={{ borderTop: "1px solid #F2F1EE", cursor: "pointer", background: hoverId === r.id ? "#FAFCF9" : "transparent", transition: "background 120ms" }}>
                  <td style={{ padding: 10 }}>{r.first_name}</td>
                  <td style={{ padding: 10 }}>{r.last_name}</td>
                  <td style={{ padding: 10 }}>{fmt(r.date_of_birth)}</td>
                  <td style={{ padding: 10 }}>{r.parent_name ?? "—"}</td>
                  <td style={{ padding: 10 }}>{r.parent_email ?? "—"}</td>
                  <td style={{ padding: 10 }}>{totalHours(r)}</td> {/* NEW */}
                  <td style={{ padding: 10 }}>{fmt(r.start_date)}</td>
                  <td style={{ padding: 10 }}>{fmt(r.end_date)}</td>
                  <td style={{ padding: 10 }}><StatusPill status={live} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* EDIT / ADD modal */}
      {editOpen && child && (
        <div onClick={() => !saving && setEditOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(920px, 96vw)", background: "#fff", border: "1px solid #E6E4E0", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", display: "grid", gridTemplateRows: "auto 1fr auto", maxHeight: "92vh" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEE", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>{isNew ? "Add child" : "Child details"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => !saving && setEditOpen(false)} style={btnGhost}>Cancel</button>
                <button onClick={saveAll as any} style={btn} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>

            <form onSubmit={saveAll} style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>
              {banner && <div style={{ background: "#fdecea", color: "#b71c1c", border: "1px solid #f5c6c6", borderRadius: 8, padding: 10 }}>{banner}</div>}

              {/* Child */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Child</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>First name</span>
                    <input style={input} value={child.first_name ?? ""} onChange={(e) => setChildField("first_name", e.target.value)} placeholder="First name" />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Surname</span>
                    <input style={input} value={child.last_name ?? ""} onChange={(e) => setChildField("last_name", e.target.value)} placeholder="Surname" />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>DOB</span>
                    <input type="date" style={input} value={toISO(child.date_of_birth)} onChange={(e) => setChildField("date_of_birth", e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Start date</span>
                    <input type="date" style={input} value={toISO(child.start_date)} onChange={(e) => setChildField("start_date", e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>End date</span>
                    <input type="date" style={input} value={toISO(child.end_date)} onChange={(e) => setChildField("end_date", e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Gender</span>
                    <select style={input} value={child.gender ?? ""} onChange={(e) => setChildField("gender", e.target.value as any)}>
                      <option value="">—</option>
                      <option value="f">Female</option>
                      <option value="m">Male</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Derived status</span>
                    <select style={input} value={statusFromDates(child.start_date, child.end_date)} onChange={() => {}}>
                      <option value="onboarding">onboarding</option>
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Ethnicity</span>
                    <select
                      style={input}
                      value={child.ethnicity ?? ""}
                      onChange={(e) => setChildField("ethnicity", e.target.value || null)}
                    >
                      <option value="">—</option>
                      {[
                        "White – British","White – Irish","White – Gypsy or Irish Traveller","White – Any other White background",
                        "Mixed – White and Black Caribbean","Mixed – White and Black African","Mixed – White and Asian","Mixed – Any other Mixed background",
                        "Asian or Asian British – Indian","Asian or Asian British – Pakistani","Asian or Asian British – Bangladeshi","Asian or Asian British – Chinese","Asian or Asian British – Any other Asian background",
                        "Black or Black British – African","Black or Black British – Caribbean","Black or Black British – Any other Black background",
                        "Other ethnic group – Arab","Other ethnic group – Any other"
                      ].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                </div>

                {isPastDate(child.end_date) && (
                  <div style={{ fontSize: 12, color: "#b26a00", marginTop: 8 }}>
                    End date is in the past: this child will be <b>archived</b> on save.
                  </div>
                )}
              </div>

                            {/* Address & Parents */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Address & Parents</div>

                {/* Single parent toggle */}
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!child.single_parent}
                    onChange={(e) =>
                      setChildField("single_parent", e.target.checked)
                    }
                  />
                  <span>Single parent household</span>
                </label>

                {/* Parent 1 */}
                <div
                  style={{
                    border: "1px solid #E6E4E0",
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Parent 1
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Name
                      </span>
                      <input
                        style={input}
                        value={child.parent1_name ?? ""}
                        onChange={(e) =>
                          setChildField("parent1_name", e.target.value)
                        }
                        placeholder="Parent 1 name"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Email
                      </span>
                      <input
                        type="email"
                        style={input}
                        value={child.parent1_email ?? ""}
                        onChange={(e) =>
                          setChildField("parent1_email", e.target.value)
                        }
                        placeholder="Parent 1 email"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        NI / NIN
                      </span>
                      <input
                        style={input}
                        value={child.parent1_nis ?? ""}
                        onChange={(e) =>
                          setChildField("parent1_nis", e.target.value)
                        }
                        placeholder="Parent 1 NI number"
                      />
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Parent 1 DOB
                      </span>
                      <input
                        type="date"
                        style={input}
                        value={toISO(child.parent1_dob)}
                        onChange={(e) =>
                          setChildField("parent1_dob", e.target.value)
                        }
                      />
                    </label>

                    {/* Parent phone (shared) */}
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Parent phone
                      </span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "140px 1fr",
                          gap: 8,
                        }}
                      >
                        <select
                          value={phoneCountry}
                          onChange={(e) =>
                            setPhoneCountry(e.currentTarget.value)
                          }
                          style={input}
                          title="Country code"
                        >
                          <option value="+44">UK +44</option>
                          <option value="+353">IE +353</option>
                          <option value="+49">DE +49</option>
                          <option value="+33">FR +33</option>
                          <option value="+34">ES +34</option>
                          <option value="+351">PT +351</option>
                          <option value="+30">GR +30</option>
                          <option value="+39">IT +39</option>
                          <option value="+48">PL +48</option>
                          <option value="+31">NL +31</option>
                          <option value="+32">BE +32</option>
                          <option value="+41">CH +41</option>
                          <option value="+43">AT +43</option>
                          <option value="+420">CZ +420</option>
                          <option value="+421">SK +421</option>
                          <option value="+36">HU +36</option>
                          <option value="+46">SE +46</option>
                          <option value="+47">NO +47</option>
                          <option value="+45">DK +45</option>
                          <option value="+358">FI +358</option>
                          <option value="+386">SI +386</option>
                          <option value="+385">HR +385</option>
                          <option value="+371">LV +371</option>
                          <option value="+370">LT +370</option>
                          <option value="+372">EE +372</option>
                          <option value="+356">MT +356</option>
                          <option value="+357">CY +357</option>
                          <option value="+352">LU +352</option>
                          <option value="+1">US +1</option>
                          <option value="+61">AU +61</option>
                          <option value="+64">NZ +64</option>
                        </select>
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="e.g. 07123 456789"
                          style={input}
                          value={phoneLocal}
                          onChange={(e) => setPhoneLocal(e.target.value)}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {/* Parent 2 */}
                <div
                  style={{
                    border: "1px solid #E6E4E0",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Parent 2
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Name
                      </span>
                      <input
                        style={input}
                        value={child.parent2_name ?? ""}
                        onChange={(e) =>
                          setChildField("parent2_name", e.target.value)
                        }
                        placeholder="Parent 2 name"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Email
                      </span>
                      <input
                        type="email"
                        style={input}
                        value={child.parent2_email ?? ""}
                        onChange={(e) =>
                          setChildField("parent2_email", e.target.value)
                        }
                        placeholder="Parent 2 email"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        NI / NIN
                      </span>
                      <input
                        style={input}
                        value={child.parent2_nis ?? ""}
                        onChange={(e) =>
                          setChildField("parent2_nis", e.target.value)
                        }
                        placeholder="Parent 2 NI number"
                      />
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 8,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Parent 2 DOB
                      </span>
                      <input
                        type="date"
                        style={input}
                        value={toISO(child.parent2_dob)}
                        onChange={(e) =>
                          setChildField("parent2_dob", e.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>

                {/* Address */}
                <div
                  style={{
                    marginTop: 16,
                    borderTop: "1px dashed #E5E7EB",
                    paddingTop: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Address
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 2fr",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Address line 1
                      </span>
                      <input
                        style={input}
                        value={child.address_line1 ?? ""}
                        onChange={(e) =>
                          setChildField("address_line1", e.target.value)
                        }
                        placeholder="Address line 1"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Address line 2
                      </span>
                      <input
                        style={input}
                        value={child.address_line2 ?? ""}
                        onChange={(e) =>
                          setChildField("address_line2", e.target.value)
                        }
                        placeholder="Address line 2"
                      />
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr",
                      gap: 12,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Town/City
                      </span>
                      <input
                        style={input}
                        value={child.town ?? ""}
                        onChange={(e) => setChildField("town", e.target.value)}
                        placeholder="Town/City"
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                      >
                        Postcode
                      </span>
                      <input
                        style={input}
                        value={child.postcode ?? ""}
                        onChange={(e) =>
                          setChildField("postcode", e.target.value)
                        }
                        placeholder="Postcode"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Funding code */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Funding code</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Code</span>
                    <input style={input} placeholder="Code" value={fCode?.code ?? ""} onChange={(e) => setFCodeField("code", e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Status</span>
                    <select style={input} value={fCode?.status ?? "pending"} onChange={(e) => setFCodeField("status", e.target.value as any)}>
                      <option value="pending">pending</option>
                      <option value="renewal_due">renewal_due</option>
                      <option value="submitted">submitted</option>
                      <option value="verified">verified</option>
                      <option value="expired">expired</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Valid from</span>
                    <input type="date" style={input} value={fCode?.valid_from ?? ""} onChange={(e) => setFCodeField("valid_from", e.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Expiry date</span>
                    <input type="date" style={input} value={fCode?.expiry_date ?? ""} onChange={(e) => setFCodeField("expiry_date", e.target.value)} />
                  </label>
                   <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
                      Parent 1 NI / NIN
                    </span>
                    <input
                      style={input}
                      value={child.parent1_nis ?? ""}
                      onChange={(e) => setChildField("parent1_nis", e.target.value)}
                      placeholder="Parent 1 NI number"
                    />
                  </label>
                </div>
              </div>

              {/* Funding eligibility (profile selection) */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Funding eligibility</div>

                {/* Controls: None / WP / D2 (WP & D2 can both be selected) */}
                <div style={{ display: "grid", gap: 10, maxWidth: 860 }}>
                  {/* None (clears both) */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #E6E4E0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="elig-none-wp-d2"
                      checked={!child.claim_working_parent && !child.claim_disadvantaged2}
                      onChange={() => {
                        setChildField("claim_working_parent", false);
                        setChildField("claim_disadvantaged2", false);
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>None</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        No family-based funding selected. Universal 15 will still auto-apply from the first term after turning 3.
                      </div>
                    </div>
                  </label>

                  {/* Working Parent */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #E6E4E0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!child.claim_working_parent}
                      onChange={(e) => setChildField("claim_working_parent", e.currentTarget.checked)}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>Working Parent</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        From 9m–4y11m. HMRC code required; reconfirm every 3 months. Stacks with Universal (age 3–4) and may stack with D2 (policy-date aware in Funding).
                      </div>
                    </div>
                  </label>

                  {/* Disadvantaged 2s */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #E6E4E0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!child.claim_disadvantaged2}
                      onChange={(e) => setChildField("claim_disadvantaged2", e.currentTarget.checked)}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>Disadvantaged 2s</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        For eligible 2s (means-tested). From 24–35m. Local authority checks evidence.
                      </div>
                    </div>
                  </label>
                </div>

                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
                  <b>Note:</b> Universal 15 applies automatically by age (36–59m). Funding & Finance will resolve the correct 15h blocks for each selected term.
                </div>
              </div>

              {/* Consumables (unchanged) */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Consumables</div>
                {child.id ? (
                  <ChildConsumablesClient
                    childId={child.id}
                    bandOverride={hoursToBand(child.funded_hours_per_week)}
                  />
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    Save the child first to manage consumables opt-outs.
                  </div>
                )}
              </div>

              {/* Attended hours */}
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Attended hours</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 8 }}>
                  {([
                    ["MON","hours_mon"],
                    ["TUE","hours_tue"],
                    ["WED","hours_wed"],
                    ["THU","hours_thu"],
                    ["FRI","hours_fri"],
                  ] as const).map(([label, key]) => (
                    <label key={key} style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", opacity: 0.85 }}>{label}</span>
                      <input
                        type="number" min={0} step={0.5}
                        value={(child as any)?.[key] ?? ""}
                        placeholder="hrs"
                        onChange={(e) => setChildField(key as any, e.target.value === "" ? null : Number(e.target.value))}
                        style={inputSm}
                      />
                    </label>
                  ))}
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>Total</span>
                    <div style={{ ...inputSm, borderStyle: "dashed", display: "flex", alignItems: "center" }}>{totalHours(child)}</div>
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 11.5, color: "#6B7280" }}>
                  These hours are stored with the child and are not linked to a term. You can still enter/import them.
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

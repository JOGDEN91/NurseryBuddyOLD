"use client";

import React, { useRef, useState } from "react";

/* match CreateTermClient’s look */
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", fontWeight:700, cursor:"pointer" };
const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #4CAF78", background:"#4CAF78", color:"#fff", fontWeight:800, cursor:"pointer" };
const card: React.CSSProperties = { background:"#fff", borderRadius:10 };

type Term = {
  id: string;
  name: string;
  season?: string | null;
  year?: number | null;

  // nursery block
  nursery_start_date?: string | null;
  nursery_end_date?: string | null;
  nursery_weeks?: number | null;

  // LA block
  la_start_date?: string | null;
  la_end_date?: string | null;
  la_weeks?: number | null;

  // deadlines
  provider_deadline?: string | null;
  la_portal_open?: string | null;
  la_portal_close?: string | null;
};

export default function EditTermClient({ term }: { term: Term }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;

    const fd = new FormData(formRef.current);
    // normalize season/year → name on the server if you prefer; here we only send structured fields
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/funding/terms/${term.id}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // term identity
          id: term.id,
          // name parts (optional)
          season: fd.get("season") || null,
          year: fd.get("year") ? Number(fd.get("year")) : null,

          // nursery block
          nursery_start_date: fd.get("nursery_start_date") || null,
          nursery_end_date: fd.get("nursery_end_date") || null,
          nursery_weeks: fd.get("nursery_weeks") ? Number(fd.get("nursery_weeks")) : null,

          // LA block
          la_start_date: fd.get("la_start_date") || null,
          la_end_date: fd.get("la_end_date") || null,
          la_weeks: fd.get("la_weeks") ? Number(fd.get("la_weeks")) : null,

          // deadlines
          nursery_deadline: fd.get("nursery_deadline") || null, // some backends use provider_deadline
          provider_deadline: fd.get("nursery_deadline") || null,
          la_portal_open: fd.get("la_portal_open") || null,
          la_portal_close: fd.get("la_portal_close") || null,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to save term");
      setOk("Saved.");
      // reflect saved values immediately
      setTimeout(() => {
        window.location.href = "/org/nursery/overview";
      }, 600);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Derive season/year if name is like "Autumn 2025"
  const [seasonInitial, yearInitial] = (() => {
    const parts = (term.name || "").split(/\s+/);
    const y = Number(parts[1]);
    const s = parts[0];
    if (!isNaN(y) && ["Autumn", "Spring", "Summer"].includes(s)) return [s, y];
    return [term.season ?? undefined, term.year ?? undefined];
  })();

  return (
    <div style={{ ...card, border: "1px solid #EEE" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid #EEE", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight: 800 }}>Edit full term details</div>
        {saving ? <span>Saving…</span> : null}
      </div>

      <form ref={formRef} onSubmit={onSubmit} style={{ padding:16, display:"grid", gap:12 }}>
        {/* Term name */}
        <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Term name</div>
          <div style={{ display:"grid", gridTemplateColumns:"200px 140px", gap:8 }}>
            <select name="season" defaultValue={seasonInitial ?? "Autumn"} style={input}>
              <option>Autumn</option>
              <option>Spring</option>
              <option>Summer</option>
            </select>
            <input name="year" type="number" defaultValue={yearInitial ?? new Date().getFullYear()} style={input} />
          </div>
        </div>

        {/* Nursery term */}
        <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Nursery term</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px", gap:8 }}>
            <input type="date" name="nursery_start_date" style={input} defaultValue={term.nursery_start_date ?? ""} />
            <input type="date" name="nursery_end_date" style={input} defaultValue={term.nursery_end_date ?? ""} />
            <input type="number" min={0} name="nursery_weeks" placeholder="No. of weeks" style={input} defaultValue={term.nursery_weeks ?? undefined} />
          </div>
        </div>

        {/* LA term */}
        <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Local authority term</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px", gap:8 }}>
            <input type="date" name="la_start_date" style={input} defaultValue={term.la_start_date ?? ""} />
            <input type="date" name="la_end_date" style={input} defaultValue={term.la_end_date ?? ""} />
            <input type="number" min={0} name="la_weeks" placeholder="No. of weeks" style={input} defaultValue={term.la_weeks ?? undefined} />
          </div>
        </div>

        {/* Deadlines */}
        <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Deadlines</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            <label style={{ display:"grid", gap:6 }}>
              <span style={{ fontSize:12, opacity:0.85 }}>Nursery deadline</span>
              <input type="date" name="nursery_deadline" style={input} defaultValue={(term.provider_deadline ?? "") as string} />
            </label>
            <label style={{ display:"grid", gap:6 }}>
              <span style={{ fontSize:12, opacity:0.85 }}>LA portal opens</span>
              <input type="date" name="la_portal_open" style={input} defaultValue={term.la_portal_open ?? ""} />
            </label>
            <label style={{ display:"grid", gap:6 }}>
              <span style={{ fontSize:12, opacity:0.85 }}>LA portal closes</span>
              <input type="date" name="la_portal_close" style={input} defaultValue={term.la_portal_close ?? ""} />
            </label>
          </div>
        </div>

        {/* footer */}
        <div style={{ paddingTop:4, display:"flex", gap:8, justifyContent:"flex-end" }}>
          <a href="/org/nursery/overview" style={{ ...btn, textDecoration:"none", display:"inline-flex", alignItems:"center" }}>Cancel</a>
          <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>

        {err && (
          <div style={{ background:"#FDECEC", border:"1px solid #F3C5C5", color:"#8A1F1F", borderRadius:8, padding:"10px 12px", fontWeight:700 }}>
            {err}
          </div>
        )}
        {ok && (
          <div style={{ background:"#E6F5EE", border:"1px solid #C9ECD9", color:"#1F7A55", borderRadius:8, padding:"10px 12px", fontWeight:700 }}>
            {ok}
          </div>
        )}
      </form>
    </div>
  );
}

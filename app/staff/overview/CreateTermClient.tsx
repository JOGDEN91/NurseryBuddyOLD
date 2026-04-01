"use client";

import React, { useRef, useState } from "react";

/* tiny styles */
const input: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #DADADA", background:"#fff" };
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #DADADA", background:"#fff", fontWeight:700, cursor:"pointer" };
const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:8, border:"1px solid #4CAF78", background:"#4CAF78", color:"#fff", fontWeight:800, cursor:"pointer" };

export default function CreateTermClient() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<{ msg: string; termId?: string|null; name?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(formRef.current!);
    const res = await fetch("/api/funding/terms", { method: "POST", body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr({ msg: j?.error || "Could not create term", termId: j?.term_id ?? null, name: j?.name });
      return;
    }
    setOpen(false);
    window.location.reload();
  }

  return (
    <div style={{ position:"relative" }}>
      <button type="button" style={btnPrimary} onClick={()=>setOpen(true)}>Create new term</button>

      {open && (
        <div
          /* modal root */
          style={{
            position:"fixed", inset:0, zIndex:60,
            display:"grid", placeItems:"center", padding:16
          }}
        >
          {/* overlay BEHIND the panel */}
          <div
            aria-hidden
            onClick={()=>setOpen(false)}
            style={{
              position:"absolute", inset:0,
              background:"rgba(0,0,0,0.35)",
              zIndex: 0,             // behind panel
            }}
          />

          {/* panel ABOVE the overlay and fully clickable */}
          <div
            style={{
              background:"#fff", border:"1px solid #E6E4E0", borderRadius:12,
              width:"min(920px, 96vw)", maxHeight:"92vh",
              display:"grid", gridTemplateRows:"auto 1fr auto",
              position:"relative",   // stacking context
              zIndex: 1,             // above overlay
              pointerEvents:"auto",
            }}
          >
            {/* header */}
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #EEE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight: 800 }}>Create funding term</div>
              <button type="button" style={btn} onClick={()=>setOpen(false)}>Close</button>
            </div>

            {/* form */}
            <form ref={formRef} onSubmit={onSubmit} style={{ padding:16, overflow:"auto", display:"grid", gap:12 }}>
              {/* Term name */}
              <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>Term name</div>
                <div style={{ display:"grid", gridTemplateColumns:"200px 140px", gap:8 }}>
                  <select name="season" defaultValue="Autumn" style={input}>
                    <option>Autumn</option>
                    <option>Spring</option>
                    <option>Summer</option>
                  </select>
                  <input name="year" type="number" defaultValue={new Date().getFullYear()} style={input} />
                </div>
              </div>

              {/* Nursery term */}
              <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>Nursery term</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px", gap:8 }}>
                  <input type="date" name="nursery_start_date" style={input} />
                  <input type="date" name="nursery_end_date" style={input} />
                  <input type="number" min={0} name="nursery_weeks" placeholder="No. of weeks" style={input} />
                </div>
              </div>

              {/* LA term */}
              <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>Local authority term</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 160px", gap:8 }}>
                  <input type="date" name="la_start_date" style={input} />
                  <input type="date" name="la_end_date" style={input} />
                  <input type="number" min={0} name="la_weeks" placeholder="No. of weeks" style={input} />
                </div>
              </div>

              {/* Deadlines */}
              <div style={{ background:"#fff", border:"1px solid #EEE", borderRadius:10, padding:12 }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>Deadlines</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                  <label style={{ display:"grid", gap:6 }}>
                    <span style={{ fontSize:12, opacity:0.85 }}>Nursery deadline</span>
                    <input type="date" name="nursery_deadline" style={input} />
                  </label>
                  <label style={{ display:"grid", gap:6 }}>
                    <span style={{ fontSize:12, opacity:0.85 }}>LA portal opens</span>
                    <input type="date" name="la_portal_open" style={input} />
                  </label>
                  <label style={{ display:"grid", gap:6 }}>
                    <span style={{ fontSize:12, opacity:0.85 }}>LA portal closes</span>
                    <input type="date" name="la_portal_close" style={input} />
                  </label>
                </div>
              </div>

              {/* footer */}
              <div style={{ paddingTop:4, display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button type="button" style={btn} onClick={()=>setOpen(false)}>Cancel</button>
                <button type="submit" style={btnPrimary}>Save term</button>
              </div>
            </form>
          </div>

          {/* error dialog (own stacking context so it's always clickable) */}
          {err && (
            <div
              style={{
                position:"fixed", inset:0, zIndex:70,
                display:"grid", placeItems:"center", padding:16
              }}
            >
              {/* error overlay BEHIND the error content */}
              <div
                onClick={()=>setErr(null)}
                aria-hidden
                style={{
                  position:"absolute", inset:0,
                  background:"rgba(0,0,0,0.4)",
                  zIndex: 0,             // behind dialog
                }}
              />
              {/* error content ABOVE its overlay */}
              <div
                style={{
                  background:"#fff", border:"1px solid #E6E4E0", borderRadius:12,
                  width:"min(520px, 96vw)", padding:16, display:"grid", gap:12,
                  position:"relative", zIndex: 1, pointerEvents:"auto"
                }}
              >
                <div style={{ fontWeight:800 }}>There was a problem</div>
                <div style={{ background:"#FDECEC", border:"1px solid #F3C5C5", color:"#8A1F1F", borderRadius:8, padding:"10px 12px", fontWeight:700 }}>
                  {err.msg}
                </div>
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button type="button" style={btn} onClick={()=>setErr(null)}>Cancel</button>
                  <a
                    href={err.termId || err.name ? `/org/funding?term_name=${encodeURIComponent(err.name ?? "")}` : "/org/funding"}
                    style={{ ...btnPrimary, textDecoration:"none", display:"inline-flex", alignItems:"center" }}
                  >
                    Open term
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

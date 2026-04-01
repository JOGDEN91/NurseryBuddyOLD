// app/admin/nurseries/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function iso(d?: string | null) {
  return d ? new Date(d).toLocaleString() : "—";
}
function StatusPill({ s }: { s?: string | null }) {
  const status = (s || "ACTIVE").toUpperCase();
  const map: Record<string, string> = {
    ACTIVE: "#E7F7ED",
    PENDING: "#FFF6E5",
    ONBOARDING: "#FFF6E5",
    SUSPENDED: "#FDEAEA",
    INACTIVE: "#F2F2F2",
  };
  const col: Record<string, string> = {
    ACTIVE: "#235D3F",
    PENDING: "#7A5A12",
    ONBOARDING: "#7A5A12",
    SUSPENDED: "#7A1A1A",
    INACTIVE: "#444",
  };
  const bg = map[status] ?? "#F2F2F2";
  const fg = col[status] ?? "#333";
  return (
    <span style={{ background: bg, color: fg, border: "1px solid #E5E5E5", borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
      {status}
    </span>
  );
}

export default async function NurseryDetail({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  const { data: rows } = await (supabase as ReturnType<typeof createServerComponentClient>)
    .rpc("admin_get_nursery", { _id: params.id });

  const n = rows?.[0];
  if (!n) {
    return (
      <div className="p-6">
        <a className="underline" href="/admin/nurseries">← Back to nurseries</a>
        <h2 className="mt-2">Nursery not found</h2>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:16 }}>
        <a className="underline" href="/admin/nurseries">← Back to nurseries</a>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
          <div>
            <h2 style={{ margin:0 }}>{n.name}</h2>
            <div style={{ color:"#666", fontSize:12, marginTop:4 }}>
              Organisation: <strong>{n.organisation_name || "—"}</strong>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <StatusPill s={n.status} />
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gap:16, gridTemplateColumns:"repeat(2, minmax(0,1fr))" }}>
        {/* Left card */}
        <div style={card}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Profile</div>
          <div style={row}><span className="text-gray-500">Nursery ID</span>
            <span style={{ display:"inline-flex", gap:8, alignItems:"center" }}>
              <code>{n.id}</code>
              <CopyButton text={n.id} />
            </span>
          </div>
          <div style={row}><span className="text-gray-500">Organisation</span><span>{n.organisation_name || "—"}</span></div>
          <div style={row}><span className="text-gray-500">County</span><span>{n.county || "—"}</span></div>
          <div style={row}><span className="text-gray-500">Country</span><span>{n.country || "—"}</span></div>
          <div style={row}><span className="text-gray-500">Contact number</span><span>{n.contact_phone || "—"}</span></div>
          <div style={row}><span className="text-gray-500">Member since</span><span>{iso(n.created_at)}</span></div>
        </div>

        {/* Right card — placeholders you can wire later */}
        <div style={card}>
          <div style={{ fontWeight:800, marginBottom:8 }}>At a glance</div>
          <div style={row}><span className="text-gray-500">Active children</span><span>—</span></div>
          <div style={row}><span className="text-gray-500">Funding progress</span><span>—%</span></div>
          <div style={{ fontSize:12, color:"#666", marginTop:8 }}>
            Hook these up to your data once available.
          </div>
        </div>
      </div>
    </div>
  );
}

/* client copy button */
"use client";
function CopyButton({ text }: { text: string }) {
  return (
    <button
      className="border rounded px-2 py-1"
      onClick={() => navigator.clipboard.writeText(text)}
      type="button"
      title="Copy ID"
    >
      Copy
    </button>
  );
}

/* styles */
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 16,
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderTop: "1px solid #F1F1F1",
};

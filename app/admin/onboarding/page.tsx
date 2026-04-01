// app/admin/onboarding/page.tsx
import { requireAdmin } from "@/lib/admin";

export default async function AdminOnboardingPage() {
  const { supabase } = await requireAdmin();

  const [{ data: orgs }, { data: nurseries }] = await Promise.all([
    supabase.from("organisations").select("id,name,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("nurseries").select("id,name,created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  return (
    <div style={{ display:"grid", gap:16 }}>
      <h2 style={{ margin:0 }}>Onboarding</h2>

      <div style={{ display:"grid", gap:16, gridTemplateColumns:"repeat(2, minmax(0,1fr))" }}>
        <div style={{ background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:16 }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Newest Organisations</div>
          <ul style={{ listStyle:"none", margin:0, padding:0 }}>
            {(orgs ?? []).map((o) => (
              <li key={o.id} style={{ padding:"8px 0", borderTop:"1px solid #EEE", display:"flex", justifyContent:"space-between" }}>
                <span>{o.name}</span>
                <span style={{ fontSize:12, color:"#666" }}>{new Date(o.created_at).toLocaleDateString()}</span>
              </li>
            ))}
            {(!orgs || orgs.length === 0) && <li style={{ color:"#666" }}>Nothing yet.</li>}
          </ul>
        </div>

        <div style={{ background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:16 }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Newest Nurseries</div>
          <ul style={{ listStyle:"none", margin:0, padding:0 }}>
            {(nurseries ?? []).map((n) => (
              <li key={n.id} style={{ padding:"8px 0", borderTop:"1px solid #EEE", display:"flex", justifyContent:"space-between" }}>
                <span>{n.name}</span>
                <span style={{ fontSize:12, color:"#666" }}>{new Date(n.created_at).toLocaleDateString()}</span>
              </li>
            ))}
            {(!nurseries || nurseries.length === 0) && <li style={{ color:"#666" }}>Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

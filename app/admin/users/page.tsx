// app/admin/users/page.tsx
import { requireAdmin } from "@/lib/admin";

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("profiles")
    .select("id,email,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div style={{ display:"grid", gap:16 }}>
      <h2 style={{ margin:0 }}>Users & Access</h2>

      <div style={{ background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
          <thead style={{ background:"#FAFAFA" }}>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Created</th>
              <th style={th}>User ID</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id}>
                <td style={td}>{u.email ?? "—"}</td>
                <td style={td}>{new Date(u.created_at).toLocaleString()}</td>
                <td style={td}><code>{u.id.slice(0,8)}…</code></td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={3} style={{ ...td, color:"#666" }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const th: React.CSSProperties = { textAlign:"left", padding:"10px 12px", borderBottom:"1px solid #EEE", fontWeight:600 };
const td: React.CSSProperties = { padding:"10px 12px", borderBottom:"1px solid #F3F3F3" };

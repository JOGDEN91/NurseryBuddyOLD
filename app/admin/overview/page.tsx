// app/admin/overview/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";

async function getCount(supabase: any, table: string) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();

  const [laCount, orgCount, nurseryCount, userCount] = await Promise.all([
    getCount(supabase, "local_authorities"),
    getCount(supabase, "organisations"),
    getCount(supabase, "nurseries"),
    getCount(supabase, "profiles"),
  ]);

  const { data: recentProfiles } = await supabase
    .from("profiles")
    .select("id,email,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentCases } = await supabase
    .from("funding_cases")
    .select("id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: 0 }}>Admin overview</h2>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          Quick stats across the platform.
        </p>
      </div>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        {[
          { label: "Local Authorities", value: laCount },
          { label: "Organisations", value: orgCount },
          { label: "Nurseries", value: nurseryCount },
          { label: "Users", value: userCount },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{c.value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Recent Funding Cases</div>
          {(!recentCases || recentCases.length === 0) ? (
            <div style={{ fontSize: 12, color: "#666" }}>No cases yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {recentCases.map((r) => (
                <li key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EEE" }}>
                  <span style={{ fontFamily: "monospace" }}>{r.id.slice(0, 8)}…</span>
                  <span style={{ fontSize: 12, border: "1px solid #DDD", padding: "2px 8px", borderRadius: 8 }}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Recent Signups</div>
          {(!recentProfiles || recentProfiles.length === 0) ? (
            <div style={{ fontSize: 12, color: "#666" }}>No signups yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {recentProfiles.map((p) => (
                <li key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EEE" }}>
                  <span>{p.email ?? p.id}</span>
                  <span style={{ fontSize: 12, color: "#666" }}>{new Date(p.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

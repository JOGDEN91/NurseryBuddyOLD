export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ScopeAwareGrantForm from "@/components/admin/ScopeAwareGrantForm";

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #EEE", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #F3F3F3" };

// ----- Server Actions -----
async function grantAction(formData: FormData) {
  "use server";

  const supabase = createServerActionClient({ cookies });

  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const scope = String(formData.get("scope") || "").trim();
  const la = (formData.get("la") as string) || null;
  const org = (formData.get("org") as string) || null;
  const nursery = (formData.get("nursery") as string) || null;

  if (!email || !role || !scope) return;

  await supabase.rpc("rbac_grant", {
    _email: email,
    _role: role,
    _scope: scope,
    _la: la,
    _org: org,
    _nursery: nursery,
  });

  revalidatePath("/admin/access");
  redirect("/admin/access");
}

async function revokeAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const id = String(formData.get("grant_id") || "");
  if (!id) return;

  await supabase.rpc("rbac_revoke", { _grant_id: id });

  revalidatePath("/admin/access");
  redirect("/admin/access");
}

// ----- Page -----
export default async function AccessPage() {
  const { supabase } = await requireAdmin();

  const [{ data: las }, { data: orgs }, { data: nurseries }, { data: users }, { data: grants }] =
    await Promise.all([
      supabase.from("local_authorities").select("id,name").order("name"),
      supabase.from("organisations").select("id,name").order("name"),
      supabase.from("nurseries").select("id,name").order("name"),
      supabase.from("profiles").select("id,email").order("created_at", { ascending: false }).limit(200),
      supabase.from("role_grants").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

  const emailById = new Map((users ?? []).map((u) => [u.id, u.email]));
  const rows = (grants ?? []).map((g) => ({ ...g, email: emailById.get(g.user_id) ?? null }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Users & Access — Role Grants</h2>

      <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
        <strong>Add grant</strong>
        <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
          Choose a role and scope. If scope is LA/ORG/NURSERY, pick the matching target below.
        </p>

        <ScopeAwareGrantForm
          las={las ?? []}
          orgs={orgs ?? []}
          nurseries={nurseries ?? []}
          users={users ?? []}
          action={grantAction}
        />
      </div>

      <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#FAFAFA" }}>
            <tr>
              <th style={th}>User</th>
              <th style={th}>Role</th>
              <th style={th}>Scope</th>
              <th style={th}>LA</th>
              <th style={th}>Org</th>
              <th style={th}>Nursery</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, color: "#666" }}>No grants yet.</td>
              </tr>
            )}
            {rows.map((g) => (
              <tr key={g.id}>
                <td style={td}>{g.email ?? <code>{g.user_id.slice(0, 8)}…</code>}</td>
                <td style={td}>{g.role}</td>
                <td style={td}>{g.scope}</td>
                <td style={td}><code>{g.la_id ? g.la_id.slice(0, 8) : "—"}</code></td>
                <td style={td}><code>{g.org_id ? g.org_id.slice(0, 8) : "—"}</code></td>
                <td style={td}><code>{g.nursery_id ? g.nursery_id.slice(0, 8) : "—"}</code></td>
                <td style={td}>
                  <form action={revokeAction}>
                    <input type="hidden" name="grant_id" value={g.id} />
                    <button className="rounded px-3 py-1 border" type="submit">Revoke</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

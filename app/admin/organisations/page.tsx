// app/admin/organisations/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #EEE",
  fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #F3F3F3",
};

/* =========================
   Server Actions
   ========================= */

async function createOrgAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const name = String(formData.get("name") || "").trim();
  const withBilling = formData.get("with_billing") === "on";
  const trialDaysRaw = String(formData.get("trial_days") ?? "14");
  const trialDays = Number.isNaN(Number(trialDaysRaw)) ? 14 : Number(trialDaysRaw);

  if (!name) return;

  const { data, error } = await supabase.rpc("admin_create_org", {
    _name: name,
    _with_billing: withBilling,
    _trial_days: trialDays,
  });

  // If created, jump to a (future) org detail page; otherwise just refresh the list
  if (!error && data) {
    revalidatePath("/admin/organisations");
    redirect(`/admin/organisations/${data}`);
  } else {
    revalidatePath("/admin/organisations");
    redirect("/admin/organisations");
  }
}

async function createNurseryAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const orgId = String(formData.get("org_id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!orgId || !name) return;

  await supabase.rpc("admin_create_nursery", { _org_id: orgId, _name: name });
  revalidatePath("/admin/organisations");
  redirect("/admin/organisations");
}

async function inviteOrgAdminAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const orgId = String(formData.get("org_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!orgId || !email) return;

  // ORG_ADMIN @ ORG scope
  await supabase.rpc("admin_create_invite", {
    _email: email,
    _role: "ORG_ADMIN",
    _scope: "ORG",
    _org: orgId,
  });

  // (Optional) send email via /api/invite/send with the returned invite id
  // await fetch("/api/invite/send", { method: "POST", body: JSON.stringify({ inviteId: data }) });

  revalidatePath("/admin/organisations");
  redirect("/admin/organisations");
}

/* =========================
   Page
   ========================= */

export default async function AdminOrganisationsPage() {
  const { supabase } = await requireAdmin();

  // RPCs: guaranteed to work for SUPER_ADMIN regardless of RLS
  const [{ data: orgs, error: orgErr }, { data: allNurseries, error: nurErr }] =
    await Promise.all([
      supabase.rpc("admin_list_organisations"),
      supabase.rpc("admin_list_nurseries"), // returns id, name, org_id, created_at (normalised)
    ]);

  if (orgErr) {
    return (
      <pre style={{ padding: 16, color: "#B00020" }}>
        Error loading organisations: {orgErr.message}
      </pre>
    );
  }
  if (nurErr) {
    return (
      <pre style={{ padding: 16, color: "#B00020" }}>
        Error loading nurseries: {nurErr.message}
      </pre>
    );
  }

  // Group nurseries by org_id for display
  const nurseriesByOrg = new Map<string, any[]>();
  (allNurseries ?? []).forEach((n: any) => {
    const key = n.org_id ? String(n.org_id) : "__none__";
    const arr = nurseriesByOrg.get(key) ?? [];
    arr.push(n);
    nurseriesByOrg.set(key, arr);
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Organisations</h2>

      {/* Create Organisation */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E4E0",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <form
          action={createOrgAction}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <input
            name="name"
            placeholder="Organisation name"
            className="border rounded p-2"
            required
          />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="with_billing" defaultChecked /> with billing
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            trial days{" "}
            <input
              type="number"
              name="trial_days"
              defaultValue={14}
              min={0}
              className="border rounded p-2 w-24"
            />
          </label>
          <button className="rounded p-2 bg-black text-white">Create</button>
        </form>
      </div>

      {/* Organisations table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E4E0",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#FAFAFA" }}>
            <tr>
              <th style={th}>Organisation</th>
              <th style={th}>Created</th>
              <th style={th}>Nurseries</th>
              <th style={th}>ID</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o: any) => {
              const group = nurseriesByOrg.get(String(o.id)) ?? [];
              return (
                <tr key={o.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{o.name}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      <a className="underline" href={`/admin/organisations/${o.id}`}>
                        View details
                      </a>
                    </div>
                  </td>
                  <td style={td}>
                    {o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={td}>
                    {group.length === 0 ? (
                      <span style={{ color: "#666" }}>No nurseries</span>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {group.map((n) => (
                          <li key={n.id} style={{ padding: "2px 0" }}>
                            {n.name} <span style={{ color: "#999" }}>·</span>{" "}
                            <code>{String(n.id).slice(0, 8)}…</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td style={td}>
                    <code>{String(o.id).slice(0, 8)}…</code>
                  </td>
                  <td style={td}>
                    {/* Inline actions: Add Nursery, Invite Org Admin */}
                    <div style={{ display: "grid", gap: 8 }}>
                      {/* 5B) Create Nursery */}
                      <form action={createNurseryAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="org_id" value={o.id} />
                        <input
                          name="name"
                          placeholder="New nursery name"
                          className="border rounded p-2"
                          required
                        />
                        <button className="rounded px-3 py-2 border" type="submit">
                          Add nursery
                        </button>
                      </form>

                      {/* 5C) Invite Org Admin */}
                      <form action={inviteOrgAdminAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="org_id" value={o.id} />
                        <input
                          name="email"
                          type="email"
                          placeholder="admin@company.com"
                          className="border rounded p-2"
                          required
                        />
                        <button className="rounded px-3 py-2 border" type="submit">
                          Invite org admin
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!orgs || orgs.length === 0) && (
              <tr>
                <td colSpan={5} style={{ ...td, color: "#666" }}>
                  No organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

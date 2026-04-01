// app/admin/onboarding/new/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import { cookies } from "next/headers";
import { createServerActionClient, createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

  if (!name) {
    redirect("/admin/onboarding/new?step=1");
  }

  const { data: orgId, error } = await supabase.rpc("admin_create_org", {
    _name: name,
    _with_billing: withBilling,
    _trial_days: trialDays,
  });

  if (error || !orgId) {
    // fallback to step 1 if something went wrong
    redirect("/admin/onboarding/new?step=1");
  }

  // go to step 2 with org id
  redirect(`/admin/onboarding/new?step=2&org=${orgId}`);
}

async function addNurseryAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const orgId = String(formData.get("org_id") || "");
  const name = String(formData.get("name") || "").trim();

  if (!orgId || !name) {
    redirect("/admin/onboarding/new?step=1");
  }

  await supabase.rpc("admin_create_nursery", { _org_id: orgId, _name: name });

  // stay on step 2 and refresh
  revalidatePath("/admin/onboarding/new");
  redirect(`/admin/onboarding/new?step=2&org=${orgId}`);
}

async function inviteOrgAdminAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const orgId = String(formData.get("org_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!orgId || !email) {
    redirect("/admin/onboarding/new?step=1");
  }

  await supabase.rpc("admin_create_invite", {
    _email: email,
    _role: "ORG_ADMIN",
    _scope: "ORG",
    _org: orgId,
  });

  revalidatePath("/admin/onboarding/new");
  redirect(`/admin/onboarding/new?step=3&org=${orgId}`);
}

async function inviteNurseryManagerAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const orgId = String(formData.get("org_id") || "");
  const nurseryId = String(formData.get("nursery_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!orgId || !nurseryId || !email) {
    redirect("/admin/onboarding/new?step=1");
  }

  await supabase.rpc("admin_create_invite", {
    _email: email,
    _role: "NURSERY_MANAGER",
    _scope: "NURSERY",
    _nursery: nurseryId,
  });

  revalidatePath("/admin/onboarding/new");
  redirect(`/admin/onboarding/new?step=3&org=${orgId}`);
}

/* =========================
   Helpers (server)
   ========================= */

async function getOrgAndRelated(supabase: ReturnType<typeof createServerComponentClient>, orgId: string) {
  // Fetch org
  const { data: org } = await supabase.from("organisations").select("id,name,onboarding_status,is_locked").eq("id", orgId).single();

  // Fetch nurseries under that org – support either organisation_id or org_id (OR filter)
  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id,name,created_at,organisation_id,org_id")
    .or(`organisation_id.eq.${orgId},org_id.eq.${orgId}`)
    .order("created_at", { ascending: true });

  const nurseryIds = (nurseries ?? []).map((n) => n.id);

  // Fetch invites linked to this org or its nurseries
  let invitesQuery = supabase.from("invites").select("id,email,role,scope,org_id,nursery_id,token,sent_at,accepted_at").order("sent_at", { ascending: false });
  if (nurseryIds.length > 0) {
    invitesQuery = invitesQuery.or(`org_id.eq.${orgId},nursery_id.in.(${nurseryIds.join(",")})`);
  } else {
    invitesQuery = invitesQuery.eq("org_id", orgId);
  }
  const { data: invites } = await invitesQuery;

  return { org, nurseries: nurseries ?? [], invites: invites ?? [] };
}

/* =========================
   Page
   ========================= */

export default async function OnboardingNewPage({
  searchParams,
}: {
  searchParams: { step?: string; org?: string };
}) {
  const { supabase } = await requireAdmin();

  const step = Number(searchParams?.step ?? "1");
  const orgId = searchParams?.org;

  let orgData: Awaited<ReturnType<typeof getOrgAndRelated>> | null = null;
  if (orgId) {
    orgData = await getOrgAndRelated(supabase as any, orgId);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Onboarding wizard</h2>

      {/* Stepper */}
      <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
        {[
          { n: 1, label: "Create organisation" },
          { n: 2, label: "Add nurseries" },
          { n: 3, label: "Invite users" },
        ].map((s) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                border: "1px solid #DDD",
                background: step >= s.n ? "#4CAF78" : "#FFF",
                color: step >= s.n ? "#FFF" : "#999",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
              }}
            >
              {s.n}
            </div>
            <div style={{ color: step === s.n ? "#111" : "#666" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Panels */}
      {step === 1 && <Step1CreateOrg />}
      {step === 2 && orgId && <Step2AddNurseries orgId={orgId} nurseries={orgData?.nurseries ?? []} />}
      {step === 3 && orgId && <Step3InviteUsers orgId={orgId} nurseries={orgData?.nurseries ?? []} invites={orgData?.invites ?? []} />}

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 8 }}>
        <div>
          {step > 1 && orgId && (
            <a className="underline" href={`/admin/onboarding/new?step=${step - 1}&org=${orgId}`}>
              ← Back
            </a>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {step === 1 && (
            <span style={{ fontSize: 12, color: "#666" }}>
              Create the organisation to continue.
            </span>
          )}
          {step === 2 && orgId && (
            <a className="underline" href={`/admin/onboarding/new?step=3&org=${orgId}`}>
              Next: Invite users →
            </a>
          )}
          {step === 3 && orgId && (
            <a className="underline" href={`/admin/organisations/${orgId}`}>
              Finish & view organisation →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Step Components (server)
   ========================= */

function Step1CreateOrg() {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
      <strong>Step 1 — Create organisation</strong>
      <form action={createOrgAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input name="name" placeholder="Organisation name" className="border rounded p-2" required />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="with_billing" defaultChecked /> with billing
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          trial days{" "}
          <input type="number" name="trial_days" defaultValue={14} min={0} className="border rounded p-2 w-24" />
        </label>
        <button className="rounded p-2 bg-black text-white">Create</button>
      </form>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
        We’ll create a billing account (and a trial) if you keep “with billing” checked.
      </p>
    </div>
  );
}

function Step2AddNurseries({ orgId, nurseries }: { orgId: string; nurseries: any[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
      <strong>Step 2 — Add nurseries</strong>
      <form action={addNurseryAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="org_id" value={orgId} />
        <input name="name" placeholder="Nursery name" className="border rounded p-2" required />
        <button className="rounded p-2 border">Add nursery</button>
      </form>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Current nurseries</div>
        {nurseries.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>No nurseries yet — add at least one.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {nurseries.map((n) => (
              <li key={n.id} style={{ padding: "6px 0", borderTop: "1px solid #EFEFEF" }}>
                {n.name} <span style={{ color: "#999" }}>·</span> <code>{String(n.id).slice(0, 8)}…</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Step3InviteUsers({
  orgId,
  nurseries,
  invites,
}: {
  orgId: string;
  nurseries: any[];
  invites: any[];
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6E4E0", borderRadius: 10, padding: 16, display: "grid", gap: 16 }}>
      <strong>Step 3 — Invite users</strong>

      {/* Invite Org Admins */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Organisation admins</div>
        <form action={inviteOrgAdminAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="org_id" value={orgId} />
          <input name="email" type="email" placeholder="admin@org.com" className="border rounded p-2" required />
          <button className="rounded p-2 border">Invite org admin</button>
        </form>
      </div>

      {/* Invite Nursery Managers */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Nursery managers</div>
        {nurseries.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>Add nurseries first.</div>
        ) : (
          nurseries.map((n) => (
            <form key={n.id} action={inviteNurseryManagerAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="org_id" value={orgId} />
              <input type="hidden" name="nursery_id" value={n.id} />
              <label style={{ minWidth: 180 }}>{n.name}</label>
              <input name="email" type="email" placeholder="manager@nursery.com" className="border rounded p-2" required />
              <button className="rounded p-2 border">Invite manager</button>
            </form>
          ))
        )}
      </div>

      {/* Recent invites */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Recent invites</div>
        {invites.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>No invites created yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead style={{ background: "#FAFAFA" }}>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Scope</th>
                <th style={th}>Target</th>
                <th style={th}>Status</th>
                <th style={th}>Token</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((iv) => (
                <tr key={iv.id}>
                  <td style={td}>{iv.email}</td>
                  <td style={td}>{iv.role}</td>
                  <td style={td}>{iv.scope}</td>
                  <td style={td}>
                    {iv.nursery_id
                      ? `Nursery ${String(iv.nursery_id).slice(0, 8)}…`
                      : iv.org_id
                      ? `Org ${String(iv.org_id).slice(0, 8)}…`
                      : "—"}
                  </td>
                  <td style={td}>{iv.accepted_at ? "Accepted" : "Pending"}</td>
                  <td style={td}>
                    <code>{String(iv.token).slice(0, 10)}…</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          You can send invite emails from a server route later (e.g. using Resend/SendGrid) linking to <code>/invite/&lt;token&gt;</code>.
        </p>
      </div>
    </div>
  );
}

/* Reusable cell styles */
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #EEE", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #F3F3F3" };

// app/admin/organisations/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import { cookies } from "next/headers";
import {
  createServerActionClient,
  createServerComponentClient,
} from "@supabase/auth-helpers-nextjs";
import { notFound, redirect } from "next/navigation";
import Stripe from "stripe";

/* ──────────────────────────────────────────────────────────────────────────────
   UTIL
────────────────────────────────────────────────────────────────────────────── */

function money(pennies?: number | null) {
  return "£" + ((pennies ?? 0) / 100).toFixed(2);
}
function iso(d?: string | null) {
  return d ? new Date(d).toLocaleString() : "—";
}

/* ──────────────────────────────────────────────────────────────────────────────
   SERVER ACTIONS — ORG PROFILE
────────────────────────────────────────────────────────────────────────────── */

async function saveOrgProfileAction(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const id = String(form.get("org_id") || "");
  if (!id) return;

  const payload = {
    name: String(form.get("name") || "").trim() || null,
    address_line1: String(form.get("address_line1") || "") || null,
    address_line2: String(form.get("address_line2") || "") || null,
    city: String(form.get("city") || "") || null,
    postcode: String(form.get("postcode") || "") || null,
    website_url: String(form.get("website_url") || "") || null,
    contact_name: String(form.get("contact_name") || "") || null,
    contact_email: String(form.get("contact_email") || "") || null,
    contact_phone: String(form.get("contact_phone") || "") || null,
  } as any;

  await supabase.from("organisations").update(payload).eq("id", id);
  redirect(`/admin/organisations/${id}?flash=Organisation%20updated`);
}

async function setOrgLockStatus(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const id = String(form.get("org_id") || "");
  const lock = String(form.get("lock") || "") === "true";
  const reason = String(form.get("reason") || "") || null;
  await supabase
    .from("organisations")
    .update({ is_locked: lock, lock_reason: reason })
    .eq("id", id);
  redirect(`/admin/organisations/${id}?flash=${lock ? "Locked" : "Unlocked"}`);
}

/* ──────────────────────────────────────────────────────────────────────────────
   SERVER ACTIONS — NURSERY & USERS
────────────────────────────────────────────────────────────────────────────── */

async function createNurseryAction(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const name = String(form.get("name") || "");
  if (!org_id || !name) return;
  const { error } = await supabase.rpc("admin_create_nursery", {
    _org_id: org_id,
    _name: name,
  });
  const msg = error ? "Failed%20to%20add%20nursery" : "Nursery%20added";
  redirect(`/admin/organisations/${org_id}?flash=${msg}`);
}

async function inviteUserAction(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const email = String(form.get("email") || "").toLowerCase();
  const role = String(form.get("role") || "ORG_ADMIN"); // ORG_ADMIN, NURSERY_MANAGER, PARENT
  const scope = String(form.get("scope") || "ORG"); // ORG or NURSERY
  const nursery_id = String(form.get("nursery_id") || "") || null;

  const args: any = {
    _email: email,
    _role: role,
    _scope: scope,
    _org: org_id,
  };
  if (nursery_id) args._nursery = nursery_id;

  const { error } = await supabase.rpc("admin_create_invite", args);
  const msg = error ? "Invite%20failed" : "Invite%20created";
  redirect(`/admin/organisations/${org_id}?flash=${msg}`);
}

async function revokeGrantAction(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const grant_id = String(form.get("grant_id") || "");
  if (grant_id) {
    await supabase.from("role_grants").delete().eq("id", grant_id);
  }
  redirect(`/admin/organisations/${org_id}?flash=Access%20revoked`);
}

/* ──────────────────────────────────────────────────────────────────────────────
   SERVER ACTIONS — BILLING (Stripe)
────────────────────────────────────────────────────────────────────────────── */

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
}

async function billingCreateCustomer(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const { data: org } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", org_id)
    .single();
  const stripe = stripeClient();
  const c = await stripe.customers.create({
    name: org?.name ?? `Org ${org_id.slice(0, 8)}`,
    metadata: { org_id },
  });
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", org_id)
    .single();
  if (!ba) {
    await supabase
      .from("billing_accounts")
      .insert({ org_id, provider: "stripe", customer_id: c.id });
  } else {
    await supabase
      .from("billing_accounts")
      .update({ customer_id: c.id })
      .eq("id", ba.id);
  }
  redirect(`/admin/organisations/${org_id}?flash=Customer%20created`);
}

async function billingCreateOrChangePlan(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const plan_code = String(form.get("plan_code") || "STARTER");
  const trial_days = Number(String(form.get("trial_days") || "14"));
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", org_id)
    .single();
  if (!ba?.customer_id)
    redirect(`/admin/organisations/${org_id}?flash=Create%20customer%20first`);

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("code", plan_code)
    .single();
  if (!plan)
    redirect(
      `/admin/organisations/${org_id}?flash=Plan%20${encodeURIComponent(
        plan_code
      )}%20missing`
    );

  const stripe = stripeClient();

  // Lazily create a price (dev). In prod: store price_id on plan and reuse.
  const price = await stripe.prices.create({
    unit_amount: plan!.unit_price,
    currency: "gbp",
    recurring: { interval: "month" },
    product_data: { name: plan!.name },
  });

  // Do we already have a subscription?
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("billing_account_id", ba!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) {
    const s = await stripe.subscriptions.create({
      customer: ba!.customer_id!,
      items: [{ price: price.id }],
      trial_period_days: Math.max(0, trial_days),
      collection_method: "charge_automatically",
      payment_behavior: "default_incomplete",
      metadata: { org_id, plan_id: plan!.id },
    });

    await supabase.from("subscriptions").insert({
      billing_account_id: ba!.id,
      plan_id: plan!.id,
      status: "trialing",
      provider_sub_id: s.id,
      trial_ends_at: s.trial_end
        ? new Date(s.trial_end * 1000).toISOString()
        : null,
      current_period_end: s.current_period_end
        ? new Date(s.current_period_end * 1000).toISOString()
        : null,
    });
  } else {
    // Change plan: update subscription item to new price (simple 1-item sub)
    const stripeSub = await stripe.subscriptions.update(sub.provider_sub_id!, {
      items: [{ price: price.id }],
      proration_behavior: "create_prorations",
    });
    await supabase
      .from("subscriptions")
      .update({
        plan_id: plan!.id,
        current_period_end: stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : null,
      })
      .eq("id", sub.id);
  }

  redirect(`/admin/organisations/${org_id}?flash=Plan%20saved`);
}

async function billingExtendTrial(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const days = Number(String(form.get("extra_days") || "7"));
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", org_id)
    .single();
  const { data: sub } = ba
    ? await supabase
        .from("subscriptions")
        .select("*")
        .eq("billing_account_id", ba.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    : { data: null as any };
  if (!sub) redirect(`/admin/organisations/${org_id}?flash=No%20subscription`);

  const stripe = stripeClient();
  const trialEnd =
    (sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : Date.now()) +
    days * 24 * 60 * 60 * 1000;

  await stripe.subscriptions.update(sub.provider_sub_id!, {
    trial_end: Math.floor(trialEnd / 1000),
    proration_behavior: "none",
  });

  await supabase
    .from("subscriptions")
    .update({ trial_ends_at: new Date(trialEnd).toISOString() })
    .eq("id", sub.id);

  redirect(`/admin/organisations/${org_id}?flash=Trial%20extended`);
}

async function billingPauseToggle(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const action = String(form.get("action") || "pause"); // pause|unpause
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", org_id)
    .single();
  const { data: sub } = ba
    ? await supabase
        .from("subscriptions")
        .select("*")
        .eq("billing_account_id", ba.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    : { data: null as any };
  if (!sub) redirect(`/admin/organisations/${org_id}?flash=No%20subscription`);
  const stripe = stripeClient();
  await stripe.subscriptions.update(sub.provider_sub_id!, {
    pause_collection:
      action === "pause"
        ? { behavior: "mark_uncollectible" }
        : ("" as any),
  });
  const msg = action === "pause" ? "Paused" : "Unpaused";
  redirect(`/admin/organisations/${org_id}?flash=${msg}`);
}

async function billingPortal(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", org_id)
    .single();
  if (!ba?.customer_id)
    redirect(`/admin/organisations/${org_id}?flash=No%20customer`);

  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: ba.customer_id!,
    return_url: `${
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    }/admin/organisations/${org_id}`,
  });
  redirect(session.url);
}

async function billingRefund(form: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const org_id = String(form.get("org_id") || "");
  const pi = String(form.get("payment_intent_id") || "");
  if (!pi) redirect(`/admin/organisations/${org_id}?flash=Missing%20PI`);
  const stripe = stripeClient();
  await stripe.refunds.create({ payment_intent: pi });
  redirect(`/admin/organisations/${org_id}?flash=Refund%20created`);
}

/* ──────────────────────────────────────────────────────────────────────────────
   DATA LOADER
────────────────────────────────────────────────────────────────────────────── */

async function getBundle(
  supabase: ReturnType<typeof createServerComponentClient>,
  orgId: string
) {
  // Organisation (extended profile fields expected in your table)
  const { data: org } = await supabase
    .from("organisations")
    .select(
      "id,name,onboarding_status,is_locked,lock_reason,created_at,address_line1,address_line2,city,postcode,website_url,contact_name,contact_email,contact_phone"
    )
    .eq("id", orgId)
    .single();
  if (!org) return null;

  // Nurseries
  const { data: nurseries, error: nErr } = await supabase
  .rpc("admin_nurseries_for_org", { _org_id: orgId });

  // Grants + emails
  const { data: grants } = await supabase
    .from("role_grants")
    .select("id,user_id,role,scope,org_id,nursery_id,created_at")
    .or(
      [
        `and(scope.eq.ORG,org_id.eq.${orgId})`,
        nurseries && nurseries.length
          ? `and(scope.eq.NURSERY,nursery_id.in.(${nurseries
              .map((n) => n.id)
              .join(",")}))`
          : "and(scope.eq.NURSERY,nursery_id.eq.00000000-0000-0000-0000-000000000000)",
      ].join(",")
    )
    .order("created_at", { ascending: false });

  const userIds = Array.from(new Set((grants ?? []).map((g) => g.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id,email").in("id", userIds)
    : { data: [] as any[] };
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  // Billing
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("org_id", orgId)
    .single();

  const { data: sub } = ba
    ? await supabase
        .from("subscriptions")
        .select("*")
        .eq("billing_account_id", ba.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    : { data: null as any };

  const { data: invoices } = ba
    ? await supabase
        .from("invoices")
        .select("*")
        .eq("billing_account_id", ba.id)
        .order("issued_at", { ascending: false })
        .limit(10)
    : { data: [] as any[] };

  return {
    org,
    nurseries: nurseries ?? [],
    grants: (grants ?? []).map((g) => ({ ...g, email: emailById.get(g.user_id) ?? null })),
    billing: { account: ba ?? null, subscription: sub ?? null, invoices: invoices ?? [] },
  };
}

/* ──────────────────────────────────────────────────────────────────────────────
   PAGE
────────────────────────────────────────────────────────────────────────────── */

export default async function OrgDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { flash?: string };
}) {
  const { supabase } = await requireAdmin();
  const data = await getBundle(supabase as any, params.id);
  if (!data) notFound();

  const { org, nurseries, grants, billing } = data;
  const flash = searchParams?.flash;

  // Group users by role/scope for the UI
  const orgAdmins = grants.filter((g) => g.scope === "ORG" && g.role?.includes("ADMIN"));
  const nurseryManagers = grants.filter(
    (g) => g.scope === "NURSERY" && (g.role?.includes("MANAGER") || g.role?.includes("ADMIN"))
  );
  const parents = grants.filter((g) => g.role === "PARENT");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {flash && (
        <div style={{ padding: 12, border: "1px solid #DDEEDB", background: "#F5FFF3", borderRadius: 8, color: "#254B2A" }}>
          {decodeURIComponent(flash)}
        </div>
      )}

      {/* ── ORG HEADER / PROFILE ───────────────────────── */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
          <div>
            <a className="underline" href="/admin/organisations">← Back</a>
            <h2 style={{ margin: "8px 0 0 0" }}>{org.name}</h2>
            <div style={{ color: "#666", fontSize: 12 }}>Created {iso(org.created_at)} · ID <code>{String(org.id).slice(0,8)}…</code></div>
          </div>
          <form action={setOrgLockStatus} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="org_id" value={org.id} />
            <input type="hidden" name="lock" value={(!org.is_locked).toString()} />
            {org.is_locked && (
              <input name="reason" placeholder="Reason" defaultValue={org.lock_reason ?? ""} className="border rounded p-2" />
            )}
            <button className="rounded px-3 py-2 border" type="submit">{org.is_locked ? "Unlock" : "Lock"}</button>
          </form>
        </div>

        <form action={saveOrgProfileAction} style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          <input type="hidden" name="org_id" value={org.id} />
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Organisation name</span>
            <input name="name" className="border rounded p-2" defaultValue={org.name ?? ""} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Website</span>
            <input name="website_url" className="border rounded p-2" defaultValue={org.website_url ?? ""} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Address line 1</span>
            <input name="address_line1" className="border rounded p-2" defaultValue={org.address_line1 ?? ""} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Address line 2</span>
            <input name="address_line2" className="border rounded p-2" defaultValue={org.address_line2 ?? ""} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">City</span>
            <input name="city" className="border rounded p-2" defaultValue={org.city ?? ""} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Postcode</span>
            <input name="postcode" className="border rounded p-2" defaultValue={org.postcode ?? ""} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Appointed contact — name</span>
            <input name="contact_name" className="border rounded p-2" defaultValue={org.contact_name ?? ""} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Appointed contact — email</span>
            <input name="contact_email" type="email" className="border rounded p-2" defaultValue={org.contact_email ?? ""} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Appointed contact — phone</span>
            <input name="contact_phone" className="border rounded p-2" defaultValue={org.contact_phone ?? ""} />
          </label>

          <div />
          <div style={{ display: "flex", gap: 8, justifyContent: "end" }}>
            <button className="rounded px-3 py-2 border" type="submit">Save profile</button>
          </div>
        </form>
      </div>

      {/* ── NURSERIES ─────────────────────────────────── */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 8 }}>Nurseries</div>
        <form action={createNurseryAction} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="hidden" name="org_id" value={org.id} />
          <input name="name" placeholder="New nursery name" className="border rounded p-2" required />
          <button className="rounded px-3 py-2 border" type="submit">Add nursery</button>
        </form>

        {nurseries.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>No nurseries yet.</div>
        ) : (
          <div style={{ border: "1px solid #EEE", borderRadius: 8 }}>
            {nurseries.map((n, i) => (
              <a
                key={n.id}
                href={`/admin/nurseries/${n.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr .8fr .8fr",
                  padding: "12px 14px",
                  textDecoration: "none",
                  color: "inherit",
                  borderTop: i === 0 ? "none" : "1px solid #EEE",
                }}
                className="hover:bg-gray-50"
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{n.name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>ID {String(n.id).slice(0, 8)}…</div>
                </div>
                <div style={{ fontSize: 12 }}>
                  Created <span style={{ color: "#666" }}>{n.created_at ? new Date(n.created_at).toLocaleDateString() : "—"}</span>
                </div>
                <div style={{ fontSize: 12, textAlign: "right" }}>
                  {/* placeholders you can wire later */}
                  Active children: <strong>—</strong> · Funding progress: <strong>—%</strong>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── USERS & ROLES ──────────────────────────────── */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 8 }}>Users & access</div>

        {/* Invite controls */}
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: "pointer" }}>Invite a user</summary>
          <form action={inviteUserAction} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input type="hidden" name="org_id" value={org.id} />
            <input name="email" type="email" placeholder="user@example.com" className="border rounded p-2" required />
            <select name="role" className="border rounded p-2" defaultValue="ORG_ADMIN">
              <option value="ORG_ADMIN">Org Admin</option>
              <option value="NURSERY_MANAGER">Nursery Manager</option>
              <option value="PARENT">Parent</option>
            </select>
            <select name="scope" className="border rounded p-2" defaultValue="ORG">
              <option value="ORG">Org</option>
              <option value="NURSERY">Nursery</option>
            </select>
            <select name="nursery_id" className="border rounded p-2" defaultValue="">
              <option value="">(no nursery)</option>
              {nurseries.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <button className="rounded px-3 py-2 border" type="submit">Send invite</button>
          </form>
        </details>

        {/* Org Admins */}
        <RoleSection title="Organisation admins" items={orgAdmins} orgId={org.id} />

        {/* Nursery Managers */}
        <RoleSection title="Nursery managers" items={nurseryManagers} orgId={org.id} />

        {/* Parents */}
        <RoleSection title="Parents" items={parents} orgId={org.id} />
      </div>

      {/* ── BILLING ────────────────────────────────────── */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 8 }}>Subscription & billing</div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          <div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              {billing.account?.customer_id ? (
                <>Customer: <code>{billing.account.customer_id}</code>{" "}
                  <a className="underline" target="_blank" href={`https://dashboard.stripe.com/test/customers/${billing.account.customer_id}`}>View in Stripe</a></>
              ) : (
                <span style={{ color: "#666" }}>No Stripe customer</span>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={billingCreateCustomer}>
                <input type="hidden" name="org_id" value={org.id} />
                <button className="rounded px-3 py-2 border" type="submit">Create customer</button>
              </form>

              <form action={billingCreateOrChangePlan}>
                <input type="hidden" name="org_id" value={org.id} />
                <select name="plan_code" className="border rounded p-2" defaultValue="STARTER">
                  <option value="STARTER">STARTER</option>
                  {/* add more plan codes as you add rows in public.plans */}
                </select>
                <input type="number" name="trial_days" min={0} defaultValue={14} className="border rounded p-2" style={{ width: 90 }} />
                <button className="rounded px-3 py-2 border" type="submit">Create / change plan</button>
              </form>

              <form action={billingExtendTrial}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="number" name="extra_days" min={1} defaultValue={7} className="border rounded p-2" style={{ width: 90 }} />
                <button className="rounded px-3 py-2 border" type="submit">Extend trial</button>
              </form>

              <form action={billingPauseToggle}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="action" value="pause" />
                <button className="rounded px-3 py-2 border" type="submit">Pause</button>
              </form>
              <form action={billingPauseToggle}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="action" value="unpause" />
                <button className="rounded px-3 py-2 border" type="submit">Unpause</button>
              </form>

              <form action={billingPortal}>
                <input type="hidden" name="org_id" value={org.id} />
                <button className="rounded px-3 py-2 border" type="submit">Open customer portal</button>
              </form>
            </div>

            <div style={{ marginTop: 10, fontSize: 14 }}>
              <div>Status: <strong>{billing.subscription?.status ?? "—"}</strong></div>
              <div>Trial ends: {iso(billing.subscription?.trial_ends_at)}</div>
              <div>Current period end: {iso(billing.subscription?.current_period_end)}</div>
            </div>
          </div>

          <div>
            <details>
              <summary style={{ cursor: "pointer" }}>Issue refund (advanced)</summary>
              <form action={billingRefund} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input type="hidden" name="org_id" value={org.id} />
                <input name="payment_intent_id" className="border rounded p-2" placeholder="pi_..." />
                <button className="rounded px-3 py-2 border" type="submit">Refund</button>
              </form>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Paste a Payment Intent ID from Stripe (e.g. from an invoice’s payment info).
              </div>
            </details>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Payment history</div>
          {billing.invoices.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666" }}>No invoices yet.</div>
          ) : (
            <div style={{ border: "1px solid #EEE", borderRadius: 8 }}>
              {billing.invoices.map((inv: any, i: number) => (
                <a
                  key={inv.id}
                  className="hover:bg-gray-50"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                    gap: 8,
                    padding: "10px 12px",
                    textDecoration: "none",
                    color: "inherit",
                    borderTop: i === 0 ? "none" : "1px solid #EEE",
                  }}
                  href={
                    inv.provider_invoice_id
                      ? `https://dashboard.stripe.com/test/invoices/${inv.provider_invoice_id}`
                      : "#"
                  }
                  target="_blank"
                >
                  <div>{iso(inv.issued_at)}</div>
                  <div>{iso(inv.due_date)}</div>
                  <div>{money(inv.amount_due)}</div>
                  <div>{money(inv.amount_paid)}</div>
                  <div>
                    <span style={{ border: "1px solid #DDD", padding: "2px 8px", borderRadius: 999 }}>{inv.status}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SMALL SERVER/CLIENT HYBRID PIECES
────────────────────────────────────────────────────────────────────────────── */

// simple server-component subview for role sections (with Revoke)
function RoleSection({ title, items, orgId }: { title: string; items: any[]; orgId: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#666" }}>No users here yet.</div>
      ) : (
        <div style={{ border: "1px solid #EEE", borderRadius: 8 }}>
          {items.map((g, i) => (
            <div
              key={g.id}
              className="hover:bg-gray-50"
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr .8fr .8fr .6fr .4fr",
                padding: "10px 12px",
                borderTop: i === 0 ? "none" : "1px solid #EEE",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 600 }}>{g.email ?? <code>{String(g.user_id).slice(0, 8)}…</code>}</div>
              <div>{g.role}</div>
              <div>{g.scope === "NURSERY" ? `Nursery ${String(g.nursery_id).slice(0,8)}…` : "Org"}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{iso(g.created_at)}</div>
              <form action={revokeGrantAction} style={{ textAlign: "right" }}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="grant_id" value={g.id} />
                <button className="rounded px-3 py-1 border" type="submit">Revoke</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   STYLES
────────────────────────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 16,
};
const cardTitle: React.CSSProperties = { fontWeight: 800 };
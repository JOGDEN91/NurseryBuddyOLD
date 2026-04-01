import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = headers().get("stripe-signature");
  const raw = await req.text(); // raw body!
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig!, whSecret);
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:400 });
  }

  // Service client (service role) to bypass RLS for updates
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // set this in env
    { auth: { persistSession: false } }
  );

  const handleOrgLock = async (orgId: string, lock: boolean, reason?: string) => {
    await supabase.from("organisations").update({ is_locked: lock, lock_reason: lock ? (reason || "payment_failed") : null }).eq("id", orgId);
  };

  switch (evt.type) {
    case "customer.subscription.updated":
    case "customer.subscription.created":
    case "customer.subscription.deleted": {
      const sub = evt.data.object as Stripe.Subscription;
      const providerId = sub.id;
      // Find billing_account via customer metadata/org linkage
      const orgId = (sub.metadata?.org_id as string) || "";
      // Update local subscription
      await supabase.from("subscriptions").update({
        status: mapStripeStatus(sub.status),
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
      }).eq("provider_sub_id", providerId);

      // Simple dunning: lock org when unpaid/past_due, unlock when active
      if (orgId) {
        if (["past_due","unpaid","incomplete"].includes(sub.status)) {
          await handleOrgLock(orgId, true, "payment_failed");
        } else if (sub.status === "active" || sub.status === "trialing") {
          await handleOrgLock(orgId, false);
        }
      }
      break;
    }

    case "invoice.finalized":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      const inv = evt.data.object as Stripe.Invoice;
      const amount_due = inv.amount_due ?? 0;
      const amount_paid = inv.amount_paid ?? 0;
      const status = inv.status ?? "open";
      const ba = await supabase
        .from("billing_accounts")
        .select("id, org_id")
        .eq("provider", "stripe")
        .single();

      // upsert invoice
      await supabase.from("invoices").upsert({
        provider_invoice_id: inv.id,
        billing_account_id: ba.data?.id ?? null,
        amount_due,
        amount_paid,
        status,
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        issued_at: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        paid_at: inv.status === "paid" ? new Date().toISOString() : null
      }, { onConflict: "provider_invoice_id" });

      // Optional: immediate lock on payment_failed
      if (status === "uncollectible" || status === "void" || evt.type === "invoice.payment_failed") {
        const orgId = inv.metadata?.org_id as string | undefined;
        if (orgId) await handleOrgLock(orgId, true, "payment_failed");
      }
      break;
    }
  }

  return NextResponse.json({ ok:true });
}

function mapStripeStatus(s: Stripe.Subscription.Status): string {
  // map into your enum-ish column
  switch (s) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "incomplete": return "incomplete";
    case "unpaid": return "unpaid";
    case "canceled": return "canceled";
    default: return "incomplete";
  }
}

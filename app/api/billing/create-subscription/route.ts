import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok:false, error:"Not signed in" }, { status:401 });

  const body = await req.json().catch(()=>({}));
  const orgId = String(body.orgId || "");
  const trialDays = Number(body.trialDays ?? 14);
  if (!orgId) return NextResponse.json({ ok:false, error:"Missing orgId" }, { status:400 });

  const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: user.id });
  if (!isAdmin) return NextResponse.json({ ok:false, error:"Forbidden" }, { status:403 });

  // Ensure billing account and plan
  const { data: ba, error: baErr } = await supabase.from("billing_accounts").select("*").eq("org_id", orgId).single();
  if (baErr || !ba) return NextResponse.json({ ok:false, error:"Create customer first" }, { status:400 });

  const { data: plan } = await supabase.from("plans").select("*").eq("code","STARTER").single();
  if (!plan) return NextResponse.json({ ok:false, error:"Plan STARTER missing" }, { status:400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

  // Create a Stripe Product/Price lazily (only in dev). In prod you'd precreate.
  // We'll assume 99.00 GBP monthly from earlier schema (unit_price = 9900)
  // If you already have a Stripe price id, store it on the plan row and use that.
  const price = await stripe.prices.create({
    unit_amount: plan.unit_price,
    currency: "gbp",
    recurring: { interval: "month" },
    product_data: { name: plan.name }
  });

  const sub = await stripe.subscriptions.create({
    customer: ba.customer_id!,
    items: [{ price: price.id }],
    trial_period_days: Math.max(0, trialDays),
    payment_behavior: "default_incomplete",
    collection_method: "charge_automatically",
    metadata: { org_id: orgId, plan_id: plan.id }
  });

  // record locally (status will be kept in sync via webhook)
  await supabase.from("subscriptions").insert({
    billing_account_id: ba.id,
    plan_id: plan.id,
    status: "trialing",
    provider_sub_id: sub.id,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
  });

  return NextResponse.json({ ok:true, subscription_id: sub.id, client_secret: sub.latest_invoice ? (sub as any).latest_invoice.payment_intent?.client_secret ?? null : null });
}

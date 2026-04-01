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
  if (!orgId) return NextResponse.json({ ok:false, error:"Missing orgId" }, { status:400 });

  // SUPER_ADMIN gate
  const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: user.id });
  if (!isAdmin) return NextResponse.json({ ok:false, error:"Forbidden" }, { status:403 });

  // Find/create billing account row
  const { data: baRow } = await supabase.from("billing_accounts").select("*").eq("org_id", orgId).single();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

  // Get org name for customer metadata
  const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).single();

  // Create Stripe customer
  const cust = await stripe.customers.create({
    name: org?.name ?? `Org ${orgId.slice(0,8)}`,
    metadata: { org_id: orgId }
  });

  if (!baRow) {
    const { error } = await supabase.from("billing_accounts").insert({
      org_id: orgId, provider: "stripe", customer_id: cust.id
    });
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  } else {
    await supabase.from("billing_accounts").update({ customer_id: cust.id }).eq("id", baRow.id);
  }

  return NextResponse.json({ ok:true, customer_id: cust.id });
}

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

  const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: user.id });
  if (!isAdmin) return NextResponse.json({ ok:false, error:"Forbidden" }, { status:403 });

  const { data: ba } = await supabase.from("billing_accounts").select("*").eq("org_id", orgId).single();
  if (!ba?.customer_id) return NextResponse.json({ ok:false, error:"No customer" }, { status:400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  const session = await stripe.billingPortal.sessions.create({
    customer: ba.customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/organisations/${orgId}`
  });

  return NextResponse.json({ ok:true, url: session.url });
}

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const id = params.id;

  // Set enrolment verified
  const { data: enrol, error: e1 } = await supabase
    .from("funding_enrolments")
    .update({ status: "verified", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("child_id")
    .single();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // Also bump the latest code for that child to verified + last_verified_on (optional)
  if (enrol?.child_id) {
    // pick latest code by expires_on
    const { data: codes } = await supabase
      .from("funding_codes")
      .select("id")
      .eq("child_id", enrol.child_id)
      .order("expires_on", { ascending: false })
      .limit(1);

    if (codes && codes[0]) {
      await supabase
        .from("funding_codes")
        .update({ status: "verified", last_verified_on: new Date().toISOString() })
        .eq("id", codes[0].id);
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const start_date = (body.start_date ?? "").toString().trim() || null;
  const end_date = (body.end_date ?? "").toString().trim() || null;

  // recompute status
  const today = new Date().toISOString().slice(0, 10);
  let status: "onboarding" | "active" | "archived" | undefined = undefined;
  if (end_date) status = "archived";
  else if (start_date && start_date <= today) status = "active";
  else status = "onboarding";

  const { error } = await supabase
    .from("children")
    .update({ start_date, end_date, status })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit").insert({
    actor_user_id: auth.user.id,
    entity: "child",
    entity_id: params.id,
    action: "dates_updated",
    diff: { start_date, end_date, status },
  } as any);

  return NextResponse.json({ ok: true });
}
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const status = (body?.status ?? "").toString();
  if (!["pending", "approved", "rejected", "expired"].includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { error } = await supabase
    .from("documents")
    .update({ status })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // (optional) write to audit
  await supabase.from("audit").insert({
    actor_user_id: auth.user.id,
    entity: "document",
    entity_id: params.id,
    action: `set_status:${status}`,
    diff: {},
  } as any);

  return NextResponse.json({ ok: true });
}
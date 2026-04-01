import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { error } = await supabase
    .from("children")
    .update({ status: "active", archived_at: null, archive_reason: null })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit").insert({
    actor_user_id: auth.user.id,
    entity: "child",
    entity_id: params.id,
    action: "restored",
    diff: {},
  } as any);

  return NextResponse.json({ ok: true });
}
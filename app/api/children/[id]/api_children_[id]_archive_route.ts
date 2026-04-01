import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const end_date = body?.end_date as string | undefined;
  const reason = (body?.reason ?? "").toString().trim();

  const { data: child, error: cErr } = await supabase
    .from("children")
    .select("id, nursery_id, status")
    .eq("id", params.id)
    .single();
  if (cErr || !child) return NextResponse.json({ error: "Child not found" }, { status: 404 });

  // Update status
  const { error: uErr } = await supabase
    .from("children")
    .update({
      status: "archived",
      end_date: end_date ?? null,
      archived_at: new Date().toISOString(),
      archive_reason: reason || null,
    })
    .eq("id", params.id);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  // Audit
  await supabase.from("audit").insert({
    actor_user_id: auth.user.id,
    entity: "child",
    entity_id: params.id,
    action: "archived",
    diff: { end_date, reason },
  } as any);

  return NextResponse.json({ ok: true });
}
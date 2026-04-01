import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Join audit + profiles for actor name, scoped by nursery via your RLS
  const { data } = await supabase
    .from("audit")
    .select("id, actor_user_id, entity, entity_id, action, diff, at")
    .eq("entity", "child")
    .eq("entity_id", params.id)
    .order("at", { ascending: false });

  // map actor display names
  let results: any[] = [];
  if (data && data.length) {
    const uids = Array.from(new Set(data.map((a: any) => a.actor_user_id).filter(Boolean)));
    let names = new Map<string, string>();
    if (uids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", uids);
      (profs ?? []).forEach((p: any) => names.set(p.id, p.display_name || p.email));
    }
    results = data.map((a: any) => ({
      id: a.id,
      actor: a.actor_user_id ? names.get(a.actor_user_id) || null : null,
      action: a.action,
      at: a.at,
      note: (a.diff as any)?.note ?? null,
    }));
  }

  return NextResponse.json({ items: results ?? [] });
}
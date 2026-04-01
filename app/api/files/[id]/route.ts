import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Load the file row
  const { data: row, error: e1 } = await supabase.from("app_files").select("*").eq("id", params.id).single();
  if (e1 || !row) return NextResponse.json({ error: e1?.message || "Not found" }, { status: 404 });

  // Delete from storage first (policies must allow it)
  const { error: e2 } = await supabase.storage.from(row.bucket).remove([row.path]);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  // Then delete the db row (RLS on app_files permits owner or staff same nursery)
  const { error: e3 } = await supabase.from("app_files").delete().eq("id", params.id);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
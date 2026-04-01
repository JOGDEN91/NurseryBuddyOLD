import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // RLS scopes visibility (parents see theirs; staff see nursery’s)
  const { data, error } = await supabase
    .from("app_reminders")
    .select("id,title,notes,status,due_at,creator_id,assignee_id,source") // ← no relational selects
    .order("due_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { title, notes, due_at, assignee_id } = await req.json();

  const insert = {
    title,
    notes: notes ?? null,
    due_at: due_at ?? new Date().toISOString(),
    status: "pending",
    source: "manual",
    creator_id: user.id,
    assignee_id: assignee_id ?? user.id,
  };

  const { data, error } = await supabase
    .from("app_reminders")
    .insert(insert)
    .select("id,title,notes,status,due_at,creator_id,assignee_id,source")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
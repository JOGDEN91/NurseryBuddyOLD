import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Optional: export const dynamic = "force-dynamic";

type CreateBody = {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string; // "YYYY-MM-DD" from <input type="date">
};

export async function GET() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve parent record for this user
  const { data: parent, error: parentErr } = await supabase
    .from("parents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (parentErr || !parent) {
    return NextResponse.json({ error: "Parent record not found" }, { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from("child_parents")
    .select("children(id, first_name, last_name, photo_url)")
    .eq("parent_id", parent.id)
    .order("id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const children = rows?.map((r: any) => r.children).filter(Boolean) ?? [];
  return NextResponse.json({ ok: true, children });
}

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as CreateBody;
  const first_name = (body.first_name ?? "").trim();
  const last_name = (body.last_name ?? "").trim();
  const dobRaw = (body.date_of_birth ?? "").trim();

  if (!first_name || !last_name || !dobRaw) {
    return NextResponse.json(
      { error: "first_name, last_name and date_of_birth are required" },
      { status: 400 }
    );
  }

  const { data: parent, error: parentErr } = await supabase
    .from("parents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (parentErr || !parent) {
    return NextResponse.json({ error: "Parent record not found" }, { status: 403 });
  }

  // Insert child (nursery null initially)
  const { data: child, error: insErr } = await supabase
    .from("children")
    .insert([{ first_name, last_name, date_of_birth: dobRaw, nursery_id: null }])
    .select("id")
    .single();

  if (insErr || !child) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create child" }, { status: 500 });
  }

  // Link as primary
  const { error: linkErr } = await supabase.from("child_parents").insert([
    { child_id: child.id, parent_id: parent.id, is_primary: true },
  ]);

  if (linkErr) {
    // Best-effort rollback
    await supabase.from("children").delete().eq("id", child.id);
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: child.id });
}

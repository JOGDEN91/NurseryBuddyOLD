import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Pull visible files (RLS handles scope: parent/self; staff/nursery)
  const { data: files, error: filesErr } = await supabase
    .from("app_files")
    .select("*")
    .order("created_at", { ascending: false });

  if (filesErr) return NextResponse.json({ error: filesErr.message }, { status: 400 });

  // Map child info (only for those files that have a child_id)
  const childIds = Array.from(new Set((files ?? []).map((f: any) => f.child_id).filter(Boolean)));
  let childMap = new Map<string, { child_name: string; date_of_birth: string }>();

  if (childIds.length) {
    const { data: children, error: childErr } = await supabase
      .from("app_children")
      .select("id, child_name, date_of_birth")
      .in("id", childIds as string[]);
    if (!childErr && children) {
      childMap = new Map(children.map((c: any) => [c.id, { child_name: c.child_name, date_of_birth: c.date_of_birth }]));
    }
  }

  // Add short-lived signed URLs and child details
  const enhanced = await Promise.all((files ?? []).map(async (r: any) => {
    const { data: signed } = await supabase.storage.from(r.bucket).createSignedUrl(r.path, 60 * 60);
    const child = r.child_id ? childMap.get(r.child_id) : undefined;
    return {
      ...r,
      signed_url: signed?.signedUrl ?? null,
      child_name: child?.child_name ?? null,
      child_dob: child?.date_of_birth ?? null,
    };
  }));

  return NextResponse.json({ items: enhanced });
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { path, bucket, mime_type, bytes, label, child_id, doc_type } = await req.json();
  const { data: me } = await supabase.from("app_profiles").select("*").eq("id", user.id).single();

  const insert = {
    owner_id: user.id,
    subject_id: user.id,
    nursery_id: me?.nursery_id ?? null,
    bucket: bucket || "nf-uploads",
    path,
    mime_type: mime_type ?? null,
    bytes: bytes ?? null,
    label: label ?? null,
    child_id: child_id ?? null,
    doc_type: doc_type ?? null,
  };

  const { data, error } = await supabase.from("app_files").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
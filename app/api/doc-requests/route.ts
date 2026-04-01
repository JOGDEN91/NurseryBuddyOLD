// app/api/doc-requests/route.ts

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Base rows (RLS enforces scope)
  const { data: rows, error } = await supabase
    .from("app_child_document_requests")
    .select(`
      id, child_id, nursery_id, requested_by, doc_type_id, status, linked_file_id, notes, created_at, updated_at,
      app_document_types!inner(id,label)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Collect all linked_file_ids
  const fileIds = Array.from(new Set((rows ?? []).map((r: any) => r.linked_file_id).filter(Boolean)));

  // Fetch files + build signed URLs
  const fileMap = new Map<string, any>();
  if (fileIds.length) {
    const { data: files, error: fErr } = await supabase
      .from("app_files")
      .select("id,label,bucket,path,mime_type,bytes,created_at")
      .in("id", fileIds as string[]);
    if (!fErr && files) {
      for (const f of files) {
        const { data: signed } = await supabase.storage.from(f.bucket).createSignedUrl(f.path, 60 * 60);
        fileMap.set(f.id, {
          id: f.id,
          label: f.label,
          mime_type: f.mime_type,
          bytes: f.bytes,
          created_at: f.created_at,
          signed_url: signed?.signedUrl ?? null,
        });
      }
    }
  }

  // Enhance each row with linked_file object
  const items = (rows ?? []).map((r: any) => ({
    ...r,
    linked_file: r.linked_file_id ? fileMap.get(r.linked_file_id) ?? null : null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const { child_id, doc_type_id, notes } = body || {};

  // Snapshot nursery from child
  const { data: child } = await supabase.from("app_children").select("id,nursery_id").eq("id", child_id).single();

  const insert = {
    child_id,
    nursery_id: child?.nursery_id ?? null,
    requested_by: user.id,
    doc_type_id,
    notes: notes ?? null,
  };

  const { data, error } = await supabase
    .from("app_child_document_requests")
    .insert(insert)
    .select(`
      id, child_id, nursery_id, requested_by, doc_type_id, status, linked_file_id, notes, created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
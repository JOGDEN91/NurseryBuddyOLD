// app/api/doc-requests/[id]/route.ts

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

async function attachLinkedFile(supabase: ReturnType<typeof createSupabaseServer>, row: any) {
  if (!row?.linked_file_id) return { ...row, linked_file: null };

  const { data: f } = await supabase
    .from("app_files")
    .select("id,label,bucket,path,mime_type,bytes,created_at")
    .eq("id", row.linked_file_id)
    .single();

  if (!f) return { ...row, linked_file: null };

  const { data: signed } = await supabase.storage.from(f.bucket).createSignedUrl(f.path, 60 * 60);
  return {
    ...row,
    linked_file: {
      id: f.id,
      label: f.label,
      mime_type: f.mime_type,
      bytes: f.bytes,
      created_at: f.created_at,
      signed_url: signed?.signedUrl ?? null,
    },
  };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await req.json();

  const patch: any = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.linked_file_id !== undefined) patch.linked_file_id = body.linked_file_id;
  if (body.notes !== undefined) patch.notes = body.notes;

  const { data, error } = await supabase
    .from("app_child_document_requests")
    .update(patch)
    .eq("id", params.id)
    .select(`
      id, child_id, nursery_id, requested_by, doc_type_id, status, linked_file_id, notes, created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const enhanced = await attachLinkedFile(supabase, data);
  return NextResponse.json({ item: enhanced });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("app_child_document_requests").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
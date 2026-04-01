import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // compatible with existing calls: saveRow(laId, "documents", { ... })
    const { laId, doc_type, title, url, notes, version, effective_from, approve } =
      { laId: body.laId ?? body.la_id, ...body };

    if (!laId) throw new Error("laId is required");
    if (!doc_type) throw new Error("doc_type is required");

    const payload: any = {
      la_id: laId,
      doc_type,
      title: title ?? null,
      url: url ?? null,
      notes: notes ?? null,
      version: version ?? null,
      effective_from: effective_from ?? null,
    };

    if (approve) payload.verified_at = new Date().toISOString();

    const sb = admin();
    const { data, error } = await sb
      .from("documents")
      .upsert(payload, { onConflict: "la_id,doc_type" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "save error" },
      { status: 400 }
    );
  }
}

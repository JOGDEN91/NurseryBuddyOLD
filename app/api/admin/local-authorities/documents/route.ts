import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function tableExists(supabase: any, name: string) {
  const { error } = await supabase.from(name).select("id").limit(1);
  return !error;
}
const isMissing = (msg?: string, col?: string) =>
  !!msg && new RegExp(`column .*${col}.* does not exist`, "i").test(msg || "");
const isStoragePathErr = (msg?: string) => !!msg && /storage_path/i.test(msg || "");

export async function POST(req: Request) {
  // mode: insert | update | delete
  const body = await req.json();
  const mode = String(body.mode || "").toLowerCase();
  const row = body.row || {};
  const laId = (row.laId ?? row.la_id ?? "").toString().trim();
  if (!mode || !laId) {
    return NextResponse.json({ ok: false, error: "mode and laId required" }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...o }),
        remove: (n, o) => cookieStore.set({ name: n, value: "", ...o }),
      },
    }
  );

  const useLaDocs = await tableExists(supabase, "la_documents");
  const table = useLaDocs ? "la_documents" : "documents";

  if (mode === "delete") {
    const id = row.id;
    if (id == null) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const del = await supabase.from(table).delete().eq("id", id);
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Build a schema-safe patch
  const patch: Record<string, any> = {
    la_id: laId,
    doc_type: row.doc_type,
    url: row.url,
  };
  if (typeof row.title !== "undefined") patch.title = row.title;
  if (typeof row.version !== "undefined") patch.version = row.version;
  if (typeof row.effective_from !== "undefined") patch.effective_from = row.effective_from;
  if (typeof row.notes !== "undefined") patch.notes = row.notes;

  // INSERT
  if (mode === "insert") {
    // If title is NOT NULL on your schema, provide a default
    if (patch.title == null) {
      const dt = String(patch.doc_type || "").toLowerCase();
      patch.title =
        dt === "public_site"
          ? "Public site"
          : dt === "provider_portal"
          ? "Provider portal"
          : dt.includes("term_dates")
          ? "Source: Term dates"
          : "Document";
    }
    let ins = await supabase.from(table).insert(patch).select().single();
    if (ins.error && isMissing(ins.error.message, "title")) {
      // Retry without title column
      const { title, ...rest } = patch;
      ins = await supabase.from(table).insert(rest).select().single();
    }
    if (ins.error && isStoragePathErr(ins.error.message) && table === "documents") {
      (patch as any).storage_path = "";
      ins = await supabase.from(table).insert(patch).select().single();
    }
    if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: ins.data });
  }

  // UPDATE
  if (mode === "update") {
    const id = row.id;
    if (id == null) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    let upd = await supabase.from(table).update(patch).eq("id", id).select().single();
    if (upd.error && isMissing(upd.error.message, "title")) {
      const { title, ...rest } = patch;
      upd = await supabase.from(table).update(rest).eq("id", id).select().single();
    }
    if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: upd.data });
  }

  return NextResponse.json({ ok: false, error: "unsupported mode" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function tableExists(supabase: any, name: string) {
  const { error } = await supabase.from(name).select("id").limit(1);
  return !error;
}

function isNoUniqueConstraintError(msg?: string) {
  return !!msg && /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(msg);
}

function isMissingColumnTitle(msg?: string) {
  return !!msg && /column .*title.* does not exist/i.test(msg);
}

function isStoragePathError(msg?: string) {
  return !!msg && /storage_path/i.test(msg || "");
}

function defaultTitleFor(docType: string) {
  const dt = (docType || "").toLowerCase();
  if (dt === "public_site") return "Public site";
  if (dt === "provider_portal") return "Provider portal";
  if (dt === "term_dates_source" || dt === "term_dates") return "Source: Term dates";
  return docType || "Link";
}

export async function POST(req: Request) {
  const body = await req.json();

  // accept laId or la_id
  const laId = (body.laId ?? body.la_id ?? "").toString().trim();
  const doc_type = (body.doc_type ?? "").toString().trim();
  const url = (body.url ?? "").toString().trim();
  const providedTitle = (body.title ?? "").toString().trim();
  const resolvedTitle = providedTitle || defaultTitleFor(doc_type);
  const notes = typeof body.notes === "string" ? body.notes : null;

  if (!laId || !doc_type || !url) {
    return NextResponse.json(
      { ok: false, error: "laId, doc_type, and url are required" },
      { status: 400 }
    );
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set({ name, value, ...options }),
        remove: (name, options) => cookieStore.set({ name, value: "", ...options }),
      },
    }
  );

  const useLaDocs = await tableExists(supabase, "la_documents");
  const table = useLaDocs ? "la_documents" : "documents";

  // First attempt: include a non-null title to satisfy NOT NULL constraints.
  const baseRowWithTitle: Record<string, any> = {
    la_id: laId,
    doc_type,
    url,
    title: resolvedTitle,
  };

  const baseRowNoTitle: Record<string, any> = {
    la_id: laId,
    doc_type,
    url,
  };

  async function upsertOnce(row: Record<string, any>) {
    return await supabase
      .from(table)
      .upsert(row, { onConflict: "la_id,doc_type" })
      .select()
      .single();
  }

  let up = await upsertOnce(baseRowWithTitle);

  // Legacy: storage_path NOT NULL
  if (up.error && isStoragePathError(up.error.message) && table === "documents") {
    (baseRowWithTitle as any).storage_path = "";
    up = await upsertOnce(baseRowWithTitle);
  }

  // If the table has no 'title' column, retry without title
  if (up.error && isMissingColumnTitle(up.error.message)) {
    let up2 = await upsertOnce(baseRowNoTitle);
    if (up2.error && isStoragePathError(up2.error.message) && table === "documents") {
      (baseRowNoTitle as any).storage_path = "";
      up2 = await upsertOnce(baseRowNoTitle);
    }
    up = up2;
  }

  // If ON CONFLICT can't run (no unique index), do manual merge
  if (up.error && isNoUniqueConstraintError(up.error.message)) {
    // 1) Try to find existing row
    let existingId: any = null;
    const maybe = await supabase
      .from(table)
      .select("id")
      .eq("la_id", laId)
      .eq("doc_type", doc_type)
      .maybeSingle();
    if (!maybe.error && maybe.data) {
      existingId = maybe.data.id;
    } else {
      const list = await supabase
        .from(table)
        .select("id")
        .eq("la_id", laId)
        .eq("doc_type", doc_type)
        .limit(1);
      if (!list.error && list.data?.length) existingId = list.data[0].id;
    }

    if (existingId) {
      // Update existing: try url + title, then fall back to url only if title column absent
      let upd = await supabase
        .from(table)
        .update({ url, title: resolvedTitle })
        .eq("id", existingId)
        .select()
        .single();

      if (upd.error && isMissingColumnTitle(upd.error.message)) {
        upd = await supabase
          .from(table)
          .update({ url })
          .eq("id", existingId)
          .select()
          .single();
      }

      if (upd.error) {
        return NextResponse.json({ ok: false, error: upd.error.message }, { status: 400 });
      }
      up = upd;
    } else {
      // Insert new
      let ins = await supabase.from(table).insert(baseRowWithTitle).select().single();

      if (ins.error && isMissingColumnTitle(ins.error.message)) {
        ins = await supabase.from(table).insert(baseRowNoTitle).select().single();
      }
      if (ins.error && isStoragePathError(ins.error.message) && table === "documents") {
        (baseRowNoTitle as any).storage_path = "";
        ins = await supabase.from(table).insert(baseRowNoTitle).select().single();
      }
      if (ins.error) {
        return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });
      }
      up = ins;
    }
  }

  if (up.error) {
    return NextResponse.json({ ok: false, error: up.error.message }, { status: 400 });
  }

  const saved = up.data;

  // Optional patch notes (ignore missing-column errors)
  if (notes) {
    const patchRes = await supabase
      .from(table)
      .update({ notes })
      .eq("id", saved.id)
      .select()
      .single();

    if (
      patchRes.error &&
      !/column .* does not exist|No such column|schema cache/i.test(patchRes.error.message || "")
    ) {
      return NextResponse.json({ ok: false, error: patchRes.error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

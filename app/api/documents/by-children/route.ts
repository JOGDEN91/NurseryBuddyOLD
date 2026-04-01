// app/api/documents/by-children/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function makeClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options as any),
        remove: (name, options) =>
          cookieStore.set(name, "", { ...(options as any), maxAge: 0 }),
      },
    }
  );
}

type DocRow = {
  id: string;
  child_id: string;
  status: string | null;
  created_at: string | null;
  // dynamic type column will be indexed as key "label"
  label?: string | null;
};

// Attempt to select using one of several possible "type" column names.
// Returns { rows, labelField } where labelField is the actual column chosen.
async function trySelectDocs(
  supabase: ReturnType<typeof createServerClient>,
  childIds: string[]
): Promise<{ rows: DocRow[]; labelField: string }> {
  const candidates = ["type", "doc_type", "document_type", "kind", "label"];

  for (const col of candidates) {
    // We alias the column to "label" so the rest of the code is uniform.
    const sel = `id, child_id, ${col} as label, status, created_at`;
    const { data, error } = await supabase
      .from("documents")
      .select(sel)
      .in("child_id", childIds)
      .order("created_at", { ascending: false });

    if (!error) {
      return { rows: (data as DocRow[]) || [], labelField: col };
    }

    // If the error is "column does not exist", try the next candidate.
    const msg = String(error?.message || "");
    if (!/column .* does not exist/i.test(msg)) {
      // Some other error (RLS etc.) — bubble it up.
      throw error;
    }
  }

  // If none of the candidates exist, fall back to rows without a label.
  const { data, error } = await supabase
    .from("documents")
    .select("id, child_id, status, created_at")
    .in("child_id", childIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return { rows: (data as DocRow[]) || [], labelField: "" };
}

// GET /api/documents/by-children?ids=uuid,uuid,uuid
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idsCsv = url.searchParams.get("ids") || "";
    const childIds = idsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (childIds.length === 0) {
      return NextResponse.json({ types: [], docs: {} });
    }

    const supabase = makeClient();

    // Fetch declared types if you use them; ignore "code" column entirely.
    const { data: typesDeclared } = await supabase
      .from("app_document_types")
      .select("id,label")
      .order("label", { ascending: true });

    // Fetch documents, adapting to your schema
    const { rows, labelField } = await trySelectDocs(supabase, childIds);

    // Build the list of types to render (declared first, else derive from docs)
    let types: Array<{ id?: string; label: string }> = (typesDeclared as any) || [];
    if (!types || types.length === 0) {
      const seen = new Set<string>();
      for (const r of rows) {
        const lab = (r.label || "").trim();
        if (lab) seen.add(lab);
      }
      types = Array.from(seen).sort().map((label) => ({ label }));
    }

    // Build child -> typeLabel -> latest doc
    const docsMatrix: Record<
      string,
      Record<string, { id: string; status: string | null; created_at: string | null }>
    > = {};
    for (const id of childIds) docsMatrix[id] = {};

    for (const r of rows) {
      const cid = r.child_id;
      if (!docsMatrix[cid]) continue;

      // Use the chosen label column if present; else put docs under a generic bucket
      const lab = (r.label || "").trim() || "(unspecified)";
      if (!docsMatrix[cid][lab]) {
        docsMatrix[cid][lab] = {
          id: r.id,
          status: r.status ?? null,
          created_at: r.created_at ?? null,
        };
      }
    }

    return NextResponse.json({
      // surface which column was used to help with future clean-up, but UI doesn’t rely on it
      meta: { labelFieldUsed: labelField || null },
      types,
      docs: docsMatrix,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load" },
      { status: 500 }
    );
  }
}

// app/api/documents/history/route.ts
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

// GET /api/documents/history?child_id=...&label=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const childId = url.searchParams.get("child_id");
    const labelQ = (url.searchParams.get("label") || "").trim().toLowerCase();

    if (!childId) {
      return NextResponse.json({ error: "child_id required" }, { status: 400 });
    }

    const supabase = makeClient();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("child_id", childId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Normalise a human label from whatever column you have
    const rows = (data || []).map((r: any) => {
      const label =
        (r.type ?? r.doc_type ?? r.document_type ?? r.kind ?? r.label ?? "(unspecified)") + "";
      return {
        id: r.id,
        child_id: r.child_id,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        updated_at: r.updated_at ?? r.created_at ?? null,
        uploaded_by: r.owner_id ?? r.uploaded_by ?? null,
        label,
        url: r.url ?? null, // if you store a URL/key; safe to be null
      };
    });

    const filtered =
      labelQ ? rows.filter((r: any) => r.label.toLowerCase() === labelQ) : rows;

    return NextResponse.json({ items: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}

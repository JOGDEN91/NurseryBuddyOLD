// app/api/documents/files/route.ts

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function sb() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set(n, v, o as any),
        remove: (n, o) => cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
      },
    }
  );
}

type Body = {
  child_ids?: string[];
  labels?: string[];
};

export async function POST(req: Request) {
  try {
    const { child_ids = [], labels = [] } = (await req.json().catch(() => ({}))) as Body;

    if (!Array.isArray(child_ids) || child_ids.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // Select everything to avoid "column does not exist" errors on unknown schemas.
    const { data, error } = await sb()
      .from("documents")
      .select("*")
      .in("child_id", child_ids);

    if (error) throw error;

    // Normalise rows -> unified shape expected by the UI
    const normalised = (data ?? []).map((row: any) => {
      const label: string =
        row.label ??
        row.type ??
        row.doc_type ??
        row.kind ??
        row.name ??
        "";

      const url: string | null =
        row.url ??
        row.file_url ??
        row.storage_url ??
        row.public_url ??
        null;

      const mime: string | null =
        row.mime ??
        row.mime_type ??
        row.content_type ??
        null;

      // Try a bunch of plausible timestamp fields; fall back to null
      const created_at: string | null =
        row.created_at ??
        row.updated_at ??          // if present
        row.inserted_at ??         // if present
        row.uploaded_at ??         // if present
        row.requested_at ??        // if present
        null;

      const status: string | null = row.status ?? row.state ?? null;

      return {
        child_id: row.child_id as string,
        label,
        url,
        mime,
        created_at,
        status,
      };
    });

    // Keep the latest per (child_id, label). If no timestamp, order is stable enough.
    const key = (r: any) => `${r.child_id}||${(r.label || "").toLowerCase()}`;
    normalised.sort((a: any, b: any) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta; // newest first when timestamps exist
    });

    const latestMap = new Map<string, any>();
    for (const r of normalised) {
      const k = key(r);
      if (!latestMap.has(k)) latestMap.set(k, r);
    }
    let result = Array.from(latestMap.values());

    // Optional labels filter (case-insensitive)
    if (Array.isArray(labels) && labels.length > 0) {
      const wanted = new Set(labels.map((l) => String(l).toLowerCase()));
      result = result.filter((r) => r.label && wanted.has(String(r.label).toLowerCase()));
    }

    return NextResponse.json({ items: result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch files" },
      { status: 500 }
    );
  }
}

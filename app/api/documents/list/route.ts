import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Query params:
 *  - nursery_id (required)
 *  - q (optional; matches child_name, parent_email, doc_type, code)
 *  - include_archived=1 (optional; default excludes archived children)
 *
 * Returns one row per child (non-archived by default), with the child's
 * most recent document (if any).
 */
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nursery_id") || "";
  const q = (url.searchParams.get("q") || "").trim();
  const includeArchived = url.searchParams.get("include_archived") === "1";

  if (!nurseryId) {
    return NextResponse.json({ error: "nursery_id is required" }, { status: 400 });
  }

  // children (non-archived by default)
  const childrenQ = supabase
    .from("children")
    .select("id, first_name, last_name, status, parent_email, updated_at")
    .eq("nursery_id", nurseryId);

  if (!includeArchived) childrenQ.neq("status", "archived" as any);
  if (q) childrenQ.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,parent_email.ilike.%${q}%`);

  const { data: children, error: childrenErr } = await childrenQ;
  if (childrenErr) return NextResponse.json({ error: childrenErr.message }, { status: 500 });

  if (!children?.length) return NextResponse.json({ items: [] });

  const childIds = children.map((c) => c.id);

  // latest document per child (by updated_at desc, fallback created_at if you use that)
  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, child_id, status, updated_at, created_at, type:doc_type")
    .in("child_id", childIds);

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  const latestDocByChild = new Map<string, any>();
  for (const d of docs ?? []) {
    const prev = latestDocByChild.get(d.child_id);
    const prevKey = prev ? (prev.updated_at ?? prev.created_at ?? "") : "";
    const curKey = d.updated_at ?? d.created_at ?? "";
    if (!prev || String(curKey) > String(prevKey)) {
      latestDocByChild.set(d.child_id, d);
    }
  }

  const items = children
    .map((c) => {
      const doc = latestDocByChild.get(c.id);
      const updated_at = doc?.updated_at ?? doc?.created_at ?? c.updated_at ?? null;
      return {
        id: doc?.id ?? null,
        child_id: c.id,
        child_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        doc_type: doc?.type ?? null,
        status: doc?.status ?? null,
        updated_at,
        parent_email: c.parent_email ?? null,
      };
    })
    .filter((row) => {
      if (!q) return true;
      return (
        row.child_name.toLowerCase().includes(q.toLowerCase()) ||
        (row.parent_email ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (row.doc_type ?? "").toLowerCase().includes(q.toLowerCase())
      );
    })
    .sort((a, b) => a.child_name.localeCompare(b.child_name));

  return NextResponse.json({ items });
}

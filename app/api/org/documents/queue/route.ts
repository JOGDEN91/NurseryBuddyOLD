// app/api/org/documents/queue/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 15)));

  const statusesParam = url.searchParams.get("statuses") ?? "pending,review,requested";
  const statuses = statusesParam
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user.id);

  const orgId =
    (grants ?? []).find(
      (g: any) => (g.role ?? "").toUpperCase() === "ORG_ADMIN" && g.org_id
    )?.org_id ?? null;

  if (!orgId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name")
    .eq("organisation_id", orgId);

  const nurseryList = (nurseries ?? []) as Array<{ id: string; name: string }>;
  const nurseryIds = nurseryList.map((n) => n.id);
  const nurseryNameById = new Map(nurseryList.map((n) => [n.id, n.name]));

  // Try candidate doc tables
  const candidates = ["child_documents", "documents"];
  let rows: any[] = [];
  let usedTable: string | null = null;

  for (const table of candidates) {
    const { data, error } = await supabase
      .from(table)
      .select("id, child_id, label, name, status, updated_at, created_at")
      .in("status", statuses)
      .order("updated_at", { ascending: false })
      .limit(limit * 5); // pull extra; we'll filter to org nurseries after join

    if (!error && data) {
      rows = data as any[];
      usedTable = table;
      break;
    }
  }

  if (!usedTable) {
    return NextResponse.json({
      ok: false,
      error:
        "No supported documents table found. Expected child_documents or documents.",
    });
  }

  const childIds = Array.from(
    new Set(rows.map((r) => r.child_id).filter(Boolean))
  ) as string[];

  const { data: children, error: childErr } = await supabase
    .from("children")
    .select("id, nursery_id, first_name, last_name")
    .in("id", childIds);

  if (childErr) {
    return NextResponse.json({ ok: false, error: childErr.message }, { status: 500 });
  }

  const childById = new Map((children ?? []).map((c: any) => [c.id, c]));

  // Build filtered list for org nurseries
  const items = [];
  for (const r of rows) {
    const child = childById.get(r.child_id);
    if (!child) continue;

    const nurseryId = child.nursery_id as string;
    if (!nurseryIds.includes(nurseryId)) continue;

    const childName =
      `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || "Unnamed";

    items.push({
      id: r.id,
      status: r.status,
      label: r.label ?? r.name ?? "Document",
      updated_at: r.updated_at ?? r.created_at ?? null,
      child_id: child.id,
      child_name: childName,
      nursery_id: nurseryId,
      nursery_name: nurseryNameById.get(nurseryId) ?? "Nursery",
    });
  }

  const trimmed = items.slice(0, limit);

  const counts = {
    pending: trimmed.filter((x) => String(x.status).toLowerCase() === "pending").length,
    review: trimmed.filter((x) => String(x.status).toLowerCase() === "review").length,
    requested: trimmed.filter((x) => String(x.status).toLowerCase() === "requested").length,
    total: trimmed.length,
  };

  return NextResponse.json({
    ok: true,
    table: usedTable,
    items: trimmed,
    counts,
  });
}
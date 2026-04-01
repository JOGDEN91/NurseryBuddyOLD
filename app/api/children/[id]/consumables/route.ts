// app/api/children/[id]/consumables/route.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function bridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: (n: string, v: string, o: any) =>
      jar.set({ name: n, value: v, ...(o as any) }),
    remove: (n: string, o: any) =>
      jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
  };
}

type ItemOut = {
  id: string;
  description: string;
  scope: "org" | "nursery";
  amount_15: number | null;
  amount_30: number | null;
  amount?: number | null;
  funded_band?: number | null;
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supa = createServerClient(URL, ANON, { cookies: bridge() });

  // Service client for org/nursery consumables (bypasses RLS, but we still filter by nursery/org)
  const admin = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Helper tolerating missing tables/columns
  async function safeSelect(table: string, cols: string) {
    const { data, error } = await admin.from(table).select(cols);
    if (error) return [] as any[];
    return (data ?? []) as any[];
  }

  // Load child minimally to get nursery_id
  const { data: child, error: chErr } = await supa
    .from("children")
    .select("id,nursery_id")
    .eq("id", params.id)
    .single();

  if (chErr || !child) {
    return Response.json({ error: "Child not found" }, { status: 404 });
  }

  const nursery_id = (child as any)?.nursery_id ?? null;

  // Derive org_id via nurseries table if present
  let org_id: string | null = null;
  if (nursery_id) {
    const nurseries = await safeSelect("nurseries", "id, org_id, organisation_id");
    const match = nurseries.find((n: any) => n.id === nursery_id);
    // support either org_id or organisation_id depending on schema
    org_id = match?.org_id ?? match?.organisation_id ?? null;
  }

  const items: ItemOut[] = [];

  // Nursery-scoped consumables (if table exists)
  const nurseryRows = await safeSelect(
    "nursery_consumables",
    "id, description, name, nursery_id, amount_15, amount_30, amount, funded_band"
  );
  if (nurseryRows.length) {
    for (const r of nurseryRows) {
      if (nursery_id && r.nursery_id && r.nursery_id !== nursery_id) continue;
      items.push({
        id: String(r.id),
        description: r.description ?? r.name ?? "Consumable",
        scope: "nursery",
        amount_15: r.amount_15 ?? null,
        amount_30: r.amount_30 ?? null,
        amount: r.amount ?? null,
        funded_band: r.funded_band ?? null,
      });
    }
  }

  // Org-scoped consumables
  const orgRows = await safeSelect(
    "org_consumables",
    "id, description, org_id, amount_15, amount_30, amount, funded_band"
  );
  if (orgRows.length) {
    const have = new Set(items.map((x) => x.description.toLowerCase()));
    for (const r of orgRows) {
      if (org_id && r.org_id && r.org_id !== org_id) continue;
      const desc = r.description ?? "Consumable";
      const key = String(desc).toLowerCase();
      if (!have.has(key)) {
        items.push({
          id: String(r.id),
          description: desc,
          scope: "org",
          amount_15: r.amount_15 ?? null,
          amount_30: r.amount_30 ?? null,
          amount: r.amount ?? null,
          funded_band: r.funded_band ?? null,
        });
      }
    }
  }

  // Fallback single-table consumables (if you had an older schema)
  if (!items.length) {
    const rows = await safeSelect(
      "consumables",
      "id, description, name, amount_15, amount_30, amount, funded_band"
    );
    for (const r of rows) {
      items.push({
        id: String(r.id),
        description: r.description ?? r.name ?? "Consumable",
        scope: "nursery",
        amount_15: r.amount_15 ?? null,
        amount_30: r.amount_30 ?? null,
        amount: r.amount ?? null,
        funded_band: r.funded_band ?? null,
      });
    }
  }

  // Build opt-out flags from child_consumable_optouts (presence = opted-out)
  const { data: optRows } = await supa
    .from("child_consumable_optouts")
    .select("scope, consumable_id")
    .eq("child_id", params.id);

  const optedOut: Record<string, boolean> = {};
  (optRows ?? []).forEach((r: any) => {
    const key = `${r.scope}:${r.consumable_id}`;
    optedOut[key] = true;
  });

  items.sort((a, b) => a.description.localeCompare(b.description));
  return Response.json({ items, optedOut, band: null });
}

// POST: opt-out
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({} as any));
  const { scope, consumable_id } = body || {};
  if (!scope || !consumable_id) {
    return Response.json(
      { error: "scope and consumable_id required" },
      { status: 400 }
    );
  }

  const supa = createServerClient(URL, ANON, { cookies: bridge() });

  const up = {
    child_id: params.id,
    scope: String(scope), // "org" | "nursery"
    consumable_id: String(consumable_id),
  };

  const { error } = await supa
    .from("child_consumable_optouts")
    .upsert(up, { onConflict: "child_id,scope,consumable_id" as any });

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}

// DELETE: remove opt-out
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");
  const consumable_id = searchParams.get("consumable_id");
  if (!scope || !consumable_id) {
    return Response.json(
      { error: "scope and consumable_id required" },
      { status: 400 }
    );
  }

  const supa = createServerClient(URL, ANON, { cookies: bridge() });

  const { error } = await supa
    .from("child_consumable_optouts")
    .delete()
    .eq("child_id", params.id)
    .eq("scope", scope)
    .eq("consumable_id", consumable_id);

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
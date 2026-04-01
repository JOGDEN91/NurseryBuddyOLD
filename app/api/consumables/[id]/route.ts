import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function supa() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
  );
}

function getScopeBits(req: NextRequest) {
  const url = new URL(req.url);
  const scopeQP = (url.searchParams.get("scope") || "").toLowerCase();
  const orgId = url.searchParams.get("orgId") || undefined;
  const nurseryId = url.searchParams.get("nurseryId") || undefined;
  const scope: "org" | "nursery" = scopeQP === "nursery" ? "nursery" : "org";
  return { scope, orgId, nurseryId };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supa();
  const { scope, orgId, nurseryId } = getScopeBits(req);
  const id = params.id;

  const body = await req.json().catch(() => ({} as any));
  const description =
    body?.description !== undefined ? String(body.description).trim() : undefined;
  const amount_15 =
    body?.amount_15 !== undefined ? numOrNull(body.amount_15) : undefined;
  const amount_30 =
    body?.amount_30 !== undefined ? numOrNull(body.amount_30) : undefined;

  const updates: any = {};
  if (description !== undefined) updates.description = description;
  if (amount_15 !== undefined) updates.amount_15 = amount_15;
  if (amount_30 !== undefined) updates.amount_30 = amount_30;

  // Keep legacy columns coherent when amounts are provided
  if (amount_15 !== undefined || amount_30 !== undefined) {
    const legacy_amount =
      amount_15 != null
        ? amount_15
        : amount_30 != null
        ? amount_30
        : 0; // never null to satisfy NOT NULL
    updates.amount = legacy_amount;

    // If exactly one band provided in this patch, set funded_band; otherwise leave as-is / null
    updates.funded_band =
      amount_15 != null && amount_30 == null
        ? 15
        : amount_30 != null && amount_15 == null
        ? 30
        : null;
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No changes supplied" }, { status: 422 });

  const table = scope === "org" ? "org_consumables" : "nursery_consumables";

  let q = supabase
    .from(table)
    .update(updates)
    .eq("id", id)
    .select("id, description, amount_15, amount_30, created_at")
    .single();

  if (scope === "org") {
    if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 422 });
    q = q.eq("org_id", orgId);
  } else {
    if (!nurseryId) return NextResponse.json({ error: "Missing nurseryId" }, { status: 422 });
    q = q.eq("nursery_id", nurseryId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ item: { ...data, scope } });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supa();
  const { scope, orgId, nurseryId } = getScopeBits(req);
  const id = params.id;

  const table = scope === "org" ? "org_consumables" : "nursery_consumables";
  let q = supabase.from(table).delete().eq("id", id).select("id");

  if (scope === "org") {
    if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 422 });
    q = q.eq("org_id", orgId);
  } else {
    if (!nurseryId) return NextResponse.json({ error: "Missing nurseryId" }, { status: 422 });
    q = q.eq("nursery_id", nurseryId);
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

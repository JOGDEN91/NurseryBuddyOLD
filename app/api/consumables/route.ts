// app/api/consumables/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function supa() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) =>
          jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

function getScopeBits(req: NextRequest) {
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") || "org") as "org" | "nursery";
  const orgId = url.searchParams.get("orgId") || undefined;
  const nurseryId = url.searchParams.get("nurseryId") || undefined;
  return { scope, orgId, nurseryId };
}

/**
 * GET /api/consumables?scope=org&orgId=... or scope=nursery&nurseryId=...
 *
 * Returns { items: [ { id, description, amount_15, amount_30, funded_band, amount } ] }
 */
export async function GET(req: NextRequest) {
  const supabase = supa();
  const { scope, orgId, nurseryId } = getScopeBits(req);

  const table = scope === "org" ? "org_consumables" : "nursery_consumables";

  let q = supabase
    .from(table)
    .select("id, description, amount_15, amount_30, funded_band, amount")
    .order("description", { ascending: true });

  if (scope === "org") {
    if (!orgId) {
      return NextResponse.json(
        { error: "orgId required for scope=org" },
        { status: 400 }
      );
    }
    q = q.eq("org_id", orgId);
  } else {
    if (!nurseryId) {
      return NextResponse.json(
        { error: "nurseryId required for scope=nursery" },
        { status: 400 }
      );
    }
    q = q.eq("nursery_id", nurseryId);
  }

  const { data, error } = await q;
  if (error) {
    console.error("consumables GET error", error);
    return NextResponse.json(
      { error: "Failed to load consumables" },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST /api/consumables?scope=org&orgId=...
 * body: { description, amount_15, amount_30 }
 *
 * Creates a consumable at org/nursery level.
 */
export async function POST(req: NextRequest) {
  const supabase = supa();
  const { scope, orgId, nurseryId } = getScopeBits(req);
  const body = await req.json().catch(() => ({} as any));

  const description = (body.description || "").trim();
  const amount_15 = body.amount_15 ?? null;
  const amount_30 = body.amount_30 ?? null;

  if (!description) {
    return NextResponse.json(
      { error: "Description is required" },
      { status: 400 }
    );
  }

  const table = scope === "org" ? "org_consumables" : "nursery_consumables";

  const insert: any = {
    description,
    amount_15,
    amount_30,
  };

  if (scope === "org") {
    if (!orgId) {
      return NextResponse.json(
        { error: "orgId required for scope=org" },
        { status: 400 }
      );
    }
    insert.org_id = orgId;
  } else {
    if (!nurseryId) {
      return NextResponse.json(
        { error: "nurseryId required for scope=nursery" },
        { status: 400 }
      );
    }
    insert.nursery_id = nurseryId;
  }

  // legacy columns for compatibility
  if (amount_15 != null || amount_30 != null) {
    const legacy_amount =
      amount_15 != null
        ? amount_15
        : amount_30 != null
        ? amount_30
        : 0;
    insert.amount = legacy_amount;
    insert.funded_band =
      amount_15 != null && amount_30 == null
        ? 15
        : amount_30 != null && amount_15 == null
        ? 30
        : null;
  }

  const { data, error } = await supabase
    .from(table)
    .insert(insert)
    .select("id, description, amount_15, amount_30")
    .maybeSingle();

  if (error) {
    console.error("consumables POST error", error);
    return NextResponse.json(
      { error: "Could not add consumable" },
      { status: 400 }
    );
  }

  return NextResponse.json({ item: data }, { status: 200 });
}

/**
 * DELETE /api/consumables?scope=org&orgId=...
 * body: { description }
 *
 * Deletes one or more consumables by description for the given scope.
 */
export async function DELETE(req: NextRequest) {
  const supabase = supa();
  const { scope, orgId, nurseryId } = getScopeBits(req);
  const body = await req.json().catch(() => ({} as any));
  const description = (body.description || "").trim();

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  const table = scope === "org" ? "org_consumables" : "nursery_consumables";

  let q = supabase
    .from(table)
    .delete()
    .eq("description", description)
    .select("id");

  if (scope === "org") {
    if (!orgId) {
      return NextResponse.json(
        { error: "orgId required for scope=org" },
        { status: 400 }
      );
    }
    q = q.eq("org_id", orgId);
  } else {
    if (!nurseryId) {
      return NextResponse.json(
        { error: "nurseryId required for scope=nursery" },
        { status: 400 }
      );
    }
    q = q.eq("nursery_id", nurseryId);
  }

  const { error } = await q;
  if (error) {
    console.error("consumables DELETE error", error);
    return NextResponse.json(
      { error: "Delete failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
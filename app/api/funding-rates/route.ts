import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function isNoUnique(msg?: string) {
  return !!msg && /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(msg);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") || "").toLowerCase();
  const orgId = url.searchParams.get("orgId") || "";
  const nurseryId = url.searchParams.get("nurseryId") || "";

  const store = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => store.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );

  if (scope === "org" && orgId) {
    const { data, error } = await supabase
      .from("funding_hourly_rates")
      .select("id, entitlement_id, rate_hour")
      .eq("org_id", orgId)
      .is("nursery_id", null);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, items: data ?? [] });
  }

  if (scope === "nursery" && nurseryId) {
    const { data, error } = await supabase
      .from("funding_hourly_rates")
      .select("id, entitlement_id, rate_hour")
      .eq("nursery_id", nurseryId)
      .is("org_id", null);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, items: data ?? [] });
  }

  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}

export async function POST(req: Request) {
  const body = await req.json();
  const scope: "org" | "nursery" = (body.scope || "").toLowerCase();
  const org_id: string | null = (body.org_id ?? null) ? String(body.org_id) : null;
  const nursery_id: string | null = (body.nursery_id ?? null) ? String(body.nursery_id) : null;
  const entitlement_id: string = String(body.entitlement_id || "");
  const rate_hour = body.rate_hour == null ? null : Number(body.rate_hour);

  if (!entitlement_id || (scope === "org" && !org_id) || (scope === "nursery" && !nursery_id)) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  const store = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => store.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );

  const row: any = {
    org_id: scope === "org" ? org_id : null,
    nursery_id: scope === "nursery" ? nursery_id : null,
    entitlement_id,
    rate_hour: rate_hour,
  };

  // Try UPSERT with both unique indexes (org or nursery)
  const conflict =
    scope === "org" ? "org_id,entitlement_id" : "nursery_id,entitlement_id";

  let up = await supabase
    .from("funding_hourly_rates")
    .upsert(row, { onConflict: conflict })
    .select("id, entitlement_id, rate_hour")
    .single();

  // Fallback: manual merge if unique index missing
  if (up.error && isNoUnique(up.error.message)) {
    let q = supabase.from("funding_hourly_rates").select("id").eq("entitlement_id", entitlement_id).limit(1);
    q = scope === "org" ? q.eq("org_id", org_id!).is("nursery_id", null) : q.eq("nursery_id", nursery_id!).is("org_id", null);
    const found = await q;
    if (found.data && found.data.length) {
      up = await supabase
        .from("funding_hourly_rates")
        .update({ rate_hour })
        .eq("id", found.data[0].id)
        .select("id, entitlement_id, rate_hour")
        .single();
    } else {
      up = await supabase
        .from("funding_hourly_rates")
        .insert(row)
        .select("id, entitlement_id, rate_hour")
        .single();
    }
  }

  if (up.error) return NextResponse.json({ ok: false, error: up.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, row: up.data });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const id = body.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const store = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => store.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );

  const del = await supabase.from("funding_hourly_rates").delete().eq("id", id);
  if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

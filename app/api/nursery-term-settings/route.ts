import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => store.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

// GET: /api/nursery-term-settings?nurseryId=...
export async function GET(req: Request) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nurseryId");

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nurseryId query param is required" },
      { status: 400 }
    );
  }

  // Which LA is this nursery in?
  const { data: nursery, error: nurseryErr } = await supabase
    .from("nurseries")
    .select("id, la_id")
    .eq("id", nurseryId)
    .maybeSingle();

  if (nurseryErr || !nursery) {
    return NextResponse.json(
      { error: "Nursery not found" },
      { status: 404 }
    );
  }

  const laId = (nursery as any).la_id as string | null;
  if (!laId) {
    return NextResponse.json(
      { items: [], warning: "Nursery has no la_id set" },
      { status: 200 }
    );
  }

  // Raw LA term blocks
  const { data: laTerms, error: laError } = await supabase
    .from("la_term_dates")
    .select("id, term_name, start_date, end_date, academic_year")
    .eq("la_id", laId)
    .order("start_date", { ascending: true });

  if (laError) {
    console.error("la_term_dates select error", laError);
    return NextResponse.json(
      { error: "Failed to load LA term dates" },
      { status: 400 }
    );
  }

  // Nursery overrides per block
  const { data: settings, error: settingsError } = await supabase
    .from("nursery_term_settings")
    .select(
      "id, nursery_id, la_term_date_id, enabled, " +
        "nursery_start_date, nursery_end_date, " +
        "provider_deadline_at, portal_opens_at, portal_closes_at"
    )
    .eq("nursery_id", nurseryId);

  if (settingsError) {
    console.error("nursery_term_settings select error", settingsError);
  }

  const settingsByLaId = new Map<string, any>();
  (settings ?? []).forEach((s: any) => {
    if (s.la_term_date_id) settingsByLaId.set(s.la_term_date_id, s);
  });

  const items =
    (laTerms ?? []).map((t: any) => {
      const s = settingsByLaId.get(t.id) ?? null;
      return {
        id: t.id as string,
        term_name: (t.term_name as string | null) ?? "Term",
        academic_year: (t.academic_year as string | null) ?? null,
        start_date: (t.start_date as string | null) ?? null,
        end_date: (t.end_date as string | null) ?? null,
        nursery_start_date: (s?.nursery_start_date as string | null) ?? null,
        nursery_end_date: (s?.nursery_end_date as string | null) ?? null,
        portal_opens_at: (s?.portal_opens_at as string | null) ?? null,
        portal_closes_at: (s?.portal_closes_at as string | null) ?? null,
        provider_deadline_at:
          (s?.provider_deadline_at as string | null) ?? null,
        enabled: s?.enabled !== false,
      };
    }) ?? [];

  return NextResponse.json({ items }, { status: 200 });
}

// PATCH: upsert one nursery_term_settings row
export async function PATCH(req: Request) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const nurseryId = body?.nursery_id as string | undefined;
  const laTermDateId = body?.la_term_date_id as string | undefined;

  if (!nurseryId || !laTermDateId) {
    return NextResponse.json(
      { error: "nursery_id and la_term_date_id are required" },
      { status: 400 }
    );
  }

  // All these are date-only strings: "YYYY-MM-DD" or null
  const payload: any = {
    nursery_id: nurseryId,
    la_term_date_id: laTermDateId,
    nursery_start_date:
      body?.nursery_start_date !== undefined
        ? body.nursery_start_date || null
        : null,
    nursery_end_date:
      body?.nursery_end_date !== undefined
        ? body.nursery_end_date || null
        : null,
    portal_opens_at:
      body?.portal_opens_at !== undefined ? body.portal_opens_at || null : null,
    portal_closes_at:
      body?.portal_closes_at !== undefined
        ? body.portal_closes_at || null
        : null,
    provider_deadline_at:
      body?.provider_deadline_at !== undefined
        ? body.provider_deadline_at || null
        : null,
  };

  try {
    const { data, error } = await supabase
      .from("nursery_term_settings")
      .upsert(payload, {
        onConflict: "nursery_id,la_term_date_id",
      })
      .select(
        "id, nursery_id, la_term_date_id, nursery_start_date, nursery_end_date, portal_opens_at, portal_closes_at, provider_deadline_at"
      )
      .maybeSingle();

    if (error) {
      console.error("nursery_term_settings upsert error", error);
      return NextResponse.json(
        { error: "Failed to save nursery term settings" },
        { status: 400 }
      );
    }

    return NextResponse.json({ settings: data }, { status: 200 });
  } catch (e: any) {
    console.error("nursery_term_settings PATCH error", e);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
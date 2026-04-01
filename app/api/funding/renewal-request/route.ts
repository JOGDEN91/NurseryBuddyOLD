// app/api/funding/renewal-request/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const childIds: string[] = Array.isArray(body.child_ids)
      ? body.child_ids
      : [];
    const note: string | undefined =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : undefined;

    if (!childIds.length) {
      return NextResponse.json(
        { ok: false, error: "child_ids is required" },
        { status: 400 }
      );
    }

    // RLS-aware check
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load children to get nursery_id and names
    const { data: kids, error: kidsErr } = await admin
      .from("children")
      .select("id, nursery_id, first_name, last_name")
      .in("id", childIds);

    if (kidsErr) {
      return NextResponse.json(
        { ok: false, error: kidsErr.message },
        { status: 500 }
      );
    }

    const rows = (kids || []).map((k) => ({
      nursery_id: k.nursery_id,
      child_id: k.id,
      parent_id: null,
      type: "funding_code_renewal",
      status: "requested",
      payload: {
        child_name: `${k.first_name ?? ""} ${k.last_name ?? ""}`.trim(),
        note: note || null,
      },
    }));

    if (!rows.length) {
      return NextResponse.json({ ok: true, inserted: 0 }, { status: 200 });
    }

    const { error: insErr } = await admin.from("requests").insert(rows as any[]);
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, inserted: rows.length },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("funding/renewal-request error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
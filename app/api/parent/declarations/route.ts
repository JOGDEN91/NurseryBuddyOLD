// app/api/parent/declarations/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
  };
}

export async function GET(req: Request) {
  try {
    const debug = req.url.includes("debug=1");

    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });

    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Parent row for this user
    const { data: parentRow } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!parentRow) {
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

    const parentId = parentRow.id as string;

    // 2) Children linked to this parent
    const { data: links } = await admin
      .from("child_parents")
      .select("child_id")
      .eq("parent_id", parentId);

    const childIds = (links || [])
      .map((r: any) => r.child_id)
      .filter(Boolean);

    if (!childIds.length) {
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

    // 3) Declarations for these children
    const { data: decls } = await admin
      .from("child_declarations")
      .select("id, child_id, term_id, status, created_at")
      .in("child_id", childIds)
      .order("created_at", { ascending: false });

    if (!decls || !decls.length) {
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

    const termIds = Array.from(
      new Set((decls || []).map((d: any) => d.term_id).filter(Boolean))
    ) as string[];

    // children & terms lookups
    const { data: children } = await admin
      .from("children")
      .select("id, first_name, last_name")
      .in(
        "id",
        Array.from(
          new Set((decls || []).map((d: any) => d.child_id).filter(Boolean))
        )
      );

    const { data: terms } = termIds.length
      ? await admin
          .from("la_term_dates")
          .select("id, label, start_date, end_date")
          .in("id", termIds)
      : { data: [] as any[] };

    const childMap = new Map(
      (children || []).map((c: any) => [c.id, c])
    );
    const termMap = new Map(
      (terms || []).map((t: any) => [t.id, t])
    );

    const items = (decls || []).map((d: any) => {
      const ch = childMap.get(d.child_id) || {};
      const term = termMap.get(d.term_id) || {};
      return {
        id: d.id as string,
        status: (d.status as string | null) || "pending",
        child: {
          id: d.child_id as string,
          first_name: (ch.first_name as string | null) ?? null,
          last_name: (ch.last_name as string | null) ?? null,
        },
        term: {
          id: d.term_id as string,
          label: (term.label as string | null) ?? "",
          start_date: (term.start_date as string | null) ?? null,
          end_date: (term.end_date as string | null) ?? null,
        },
        created_at: d.created_at as string | null,
      };
    });

    const payload: any = { ok: true, items };

    if (debug) {
      payload.__debug = {
        userId: user.id,
        parentId,
        childIds,
        count: items.length,
      };
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error("/api/parent/declarations GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
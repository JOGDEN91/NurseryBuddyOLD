// app/api/admin/la-term-dates/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabase();

  try {
    const url = new URL(req.url);
    const laId = (url.searchParams.get("la_id") || "").trim();

    if (!laId) {
      return NextResponse.json(
        { ok: false, error: "Missing la_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("la_term_dates")
      .select("id, term_name, academic_year, notes, start_date, end_date")
      .eq("la_id", laId)
      .order("start_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const items =
      (data || []).map((row: any) => ({
        id: row.id as string,
        term_name: row.term_name as string,
        academic_year: (row.academic_year as string | null) ?? null,
        start_date: (row.start_date as string | null) ?? null,
        end_date: (row.end_date as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      })) ?? [];

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// Update a single term row by id
export async function PATCH(req: Request) {
  const supabase = getSupabase();

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json(
        { ok: false, error: "Missing id in body" },
        { status: 400 }
      );
    }

    const { id, term_name, academic_year, start_date, end_date, notes } = body;

    const update: any = {};
    if (term_name !== undefined) update.term_name = term_name;
    if (academic_year !== undefined) update.academic_year = academic_year;
    if (start_date !== undefined) update.start_date = start_date || null;
    if (end_date !== undefined) update.end_date = end_date || null;
    if (notes !== undefined) update.notes = notes;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { error } = await supabase
      .from("la_term_dates")
      .update(update)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// Delete a single term row by id
export async function DELETE(req: Request) {
  const supabase = getSupabase();

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json(
        { ok: false, error: "Missing id in body" },
        { status: 400 }
      );
    }

    const { id } = body;

    const { error } = await supabase
      .from("la_term_dates")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

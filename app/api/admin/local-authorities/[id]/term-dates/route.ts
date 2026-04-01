// app/api/admin/local-authorities/[id]/term-dates/route.ts
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

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: { [key: string]: string | undefined };
  }
) {
  const supabase = getSupabase();

  try {
    // Be robust: pick the first param value, regardless of its key ([id], [laid], etc.)
    const laId = Object.values(params).find((v) => !!v) || "";

    if (!laId) {
      return NextResponse.json(
        { ok: false, error: "Missing laId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("la_term_dates")
      .select(
        "id, term_name, academic_year, notes, start_date, end_date, starts_on, ends_on"
      )
      .eq("la_id", laId)
      .order("start_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const items =
      (data || []).map((row: any) => {
        const start =
          row.start_date ||
          row.starts_on ||
          null;
        const end =
          row.end_date ||
          row.ends_on ||
          null;

        return {
          id: row.id as string,
          term_name: row.term_name as string,
          academic_year: (row.academic_year as string | null) ?? null,
          start_date: start as string | null,
          end_date: end as string | null,
          notes: (row.notes as string | null) ?? null,
        };
      }) ?? [];

    return NextResponse.json(
      { ok: true, items },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

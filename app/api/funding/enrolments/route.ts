// app/api/funding/enrolments/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const payload = await req.json(); // { child_id, nursery_id, term_id, mon,tue,wed,thu,fri }
    if (!payload?.child_id || !payload?.term_id || !payload?.nursery_id) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set(name, value, options as any);
          },
          remove(name, options) {
            cookieStore.set(name, "", { ...(options as any), maxAge: 0 });
          },
        },
      }
    );

    // Upsert on (child_id, term_id)
    const { data, error } = await supabase
      .from("funding_enrolments")
      .upsert(
        {
          child_id: payload.child_id,
          nursery_id: payload.nursery_id,
          term_id: payload.term_id,
          mon: payload.mon ?? null,
          tue: payload.tue ?? null,
          wed: payload.wed ?? null,
          thu: payload.thu ?? null,
          fri: payload.fri ?? null,
        },
        { onConflict: "child_id,term_id" }
      )
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ enrolment: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to upsert enrolment" }, { status: 500 });
  }
}

// app/api/documents/children/route.ts

// Returns the children visible to the current user for a given nursery.
// Query params:
//   nursery=<uuid>            (optional; if omitted we fall back to current_user_nursery())
//   include_archived=1        (optional; include archived children)

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function makeClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options as any),
        remove: (name, options) =>
          cookieStore.set(name, "", { ...(options as any), maxAge: 0 }),
      },
    }
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const nursery = url.searchParams.get("nursery"); // optional
    const includeArchived = url.searchParams.get("include_archived") === "1";

    const supabase = makeClient();

    // Build the base query
    let query = supabase
      .from("children")
      .select(
        [
          "id",
          "nursery_id",
          "first_name",
          "last_name",
          "date_of_birth",
          "status",
          "notes",
          "start_date",
          "end_date",
        ].join(",")
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (nursery) {
      query = query.eq("nursery_id", nursery);
    }

    if (!includeArchived) {
      // Only show active or onboarding by default
      query = query.in("status", ["active", "onboarding"]);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ children: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load children" },
      { status: 500 }
    );
  }
}

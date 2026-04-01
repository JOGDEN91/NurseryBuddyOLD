// app/api/org/messages/conversations/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nursery_id");

  if (!nurseryId) {
    return NextResponse.json(
      { ok: false, error: "Missing nursery_id" },
      { status: 400 }
    );
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Ensure user is logged in (RLS will still apply)
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, type, nursery_id")
    .eq("nursery_id", nurseryId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    conversations: data ?? [],
  });
}
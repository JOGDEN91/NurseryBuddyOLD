// app/api/org/context/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nurseryId");

  if (!nurseryId) {
    return NextResponse.json(
      { ok: false, error: "Missing nurseryId" },
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

  // Check auth so RLS still applies
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised" },
      { status: 401 }
    );
  }

  // Nursery lookup
  const { data: nursery, error: nurseryError } = await supabase
    .from("nurseries")
    .select("id, name, organisation_id")
    .eq("id", nurseryId)
    .maybeSingle();

  if (nurseryError || !nursery) {
    return NextResponse.json(
      { ok: false, error: nurseryError?.message || "Nursery not found" },
      { status: 404 }
    );
  }

  let orgName: string | null = null;

  if (nursery.organisation_id) {
    const { data: org, error: orgError } = await supabase
      .from("organisations")
      .select("id, name")
      .eq("id", nursery.organisation_id)
      .maybeSingle();

    if (!orgError && org) {
      orgName = (org as any).name ?? null;
    }
  }

  return NextResponse.json({
    ok: true,
    org_name: orgName,
    nursery_name: (nursery as any).name ?? null,
  });
}
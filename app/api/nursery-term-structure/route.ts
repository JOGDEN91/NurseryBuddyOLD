// app/api/nursery-term-structure/route.ts
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

// GET ?nurseryId=...
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

  const { data: nursery, error } = await supabase
    .from("nurseries")
    .select("id, term_structure")
    .eq("id", nurseryId)
    .maybeSingle();

  if (error || !nursery) {
    return NextResponse.json(
      { error: "Nursery not found" },
      { status: 404 }
    );
  }

  // term_structure is '3' | '6' | null; default to '6' when null
  const raw = (nursery as any).term_structure as string | null;
  const term_structure = raw === "3" || raw === "6" ? raw : null;

  return NextResponse.json(
    {
      nursery_id: nurseryId,
      term_structure,
      org_default: "6", // for now, organisation default is “6 terms (blocks)”
    },
    { status: 200 }
  );
}

// PUT { nursery_id, term_structure }
export async function PUT(req: Request) {
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
  const termStructure = body?.term_structure as "3" | "6" | null | undefined;

  if (!nurseryId) {
    return NextResponse.json(
      { error: "nursery_id is required" },
      { status: 400 }
    );
  }

  if (termStructure && termStructure !== "3" && termStructure !== "6") {
    return NextResponse.json(
      { error: "term_structure must be '3' or '6' or null" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("nurseries")
    .update({ term_structure: termStructure ?? null })
    .eq("id", nurseryId)
    .select("id, term_structure")
    .maybeSingle();

  if (error) {
    console.error("update nursery term_structure error", error);
    return NextResponse.json(
      { error: "Update failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ nursery: data }, { status: 200 });
}
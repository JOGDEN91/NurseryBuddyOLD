import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      get: (n) => cookieStore.get(n)?.value,
      set: (n, v, o) => cookieStore.set(n, v, o as any),
      remove: (n, o) => cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
    }}
  );

  const url = new URL(req.url);
  const childId = url.searchParams.get("child_id")!;
  const termName = url.searchParams.get("term_name") || ""; // optional
  if (!childId) return NextResponse.json({ error: "child_id required" }, { status: 400 });

  // child core
  const { data: child, error: cErr } = await supabase
    .from("children")
    .select("id, nursery_id, first_name, last_name, dob, start_date, end_date, status, parent_name, parent_email")
    .eq("id", childId)
    .maybeSingle();
  if (cErr || !child) return NextResponse.json({ error: cErr?.message || "Not found" }, { status: 404 });

  // resolve term_id (current or by name)
  let termId: string | null = null;
  if (termName) {
    const { data: t } = await supabase
      .from("funding_terms")
      .select("id")
      .eq("nursery_id", child.nursery_id)
      .eq("name", termName)
      .maybeSingle();
    termId = t?.id ?? null;
  } else {
    const { data: t } = await supabase
      .from("funding_terms")
      .select("id")
      .eq("nursery_id", child.nursery_id)
      .eq("is_current", true)
      .maybeSingle();
    termId = t?.id ?? null;
  }

  // enrolment for this term
  const { data: enrol } = termId
    ? await supabase
        .from("funding_enrolments")
        .select("id, hours_per_week, weeks, stretch, status, term_id")
        .eq("child_id", childId)
        .eq("term_id", termId)
        .maybeSingle()
    : { data: null as any };

  // latest funding code
  const { data: codes } = await supabase
    .from("funding_codes")
    .select("id, code, status, expiry_date, created_at, child_id")
    .eq("child_id", childId)
    .order("expiry_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const code = codes?.[0] ?? null;

  // documents (latest per type)
  const { data: docs } = await supabase
    .from("documents")
    .select("id, child_id, doc_type, status, expires_at, updated_at, created_at")
    .eq("child_id", childId);

  // reduce to latest per doc_type
  const latestByType: Record<string, any> = {};
  for (const d of docs ?? []) {
    const k = d.doc_type;
    const prev = latestByType[k];
    const prevKey = prev ? (prev.updated_at ?? prev.created_at ?? "") : "";
    const curKey = d.updated_at ?? d.created_at ?? "";
    if (!prev || String(curKey) > String(prevKey)) latestByType[k] = d;
  }

  return NextResponse.json({
    child,
    term_id: termId,
    enrolment: enrol,
    code,
    documents: latestByType,
  });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function chooseTable(supabase: any) {
  const { error } = await supabase.from("la_documents").select("id").limit(1);
  return error ? "documents" : "la_documents";
}

function makeGuesses(base: string) {
  const b = base.replace(/\/+$/, "");
  const tails = [
    "/term-dates",
    "/schools/term-dates",
    "/education-and-learning/schools/term-dates",
    "/education/schools/term-dates",
  ];
  return tails.map((t) => `${b}${t}`);
}

export async function POST(req: Request) {
  const body = await req.json();
  const laId: string | undefined = (body.laId ?? body.la_id)?.toString().trim();
  const { section, max = 6 } = body;

  if (!laId || section !== "term_dates") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set({ name, value, ...options }),
        remove: (name, options) => cookieStore.set({ name, value: "", ...options }),
      },
    }
  );

  const table = await chooseTable(supabase);
  const { data: docs, error } = await supabase
    .from(table)
    .select("id,doc_type,title,url,notes")
    .eq("la_id", laId)
    .in("doc_type", ["public_site", "provider_portal", "term_dates", "term_dates_source"])
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const sources = (docs || [])
    .filter((d: any) => /public_site|provider_portal/i.test(d.doc_type || ""))
    .map((d: any) => d.url)
    .filter(Boolean);

  const guesses = new Set<string>();
  for (const s of sources) {
    for (const g of makeGuesses(s)) {
      guesses.add(g);
      if (guesses.size >= max) break;
    }
    if (guesses.size >= max) break;
  }

  const candidates = Array.from(guesses).map((u) => ({
    doc_type: "term_dates_candidate",
    title: "Candidate: Term dates",
    url: u,
    notes: null,
  }));

  return NextResponse.json({ ok: true, candidates });
}

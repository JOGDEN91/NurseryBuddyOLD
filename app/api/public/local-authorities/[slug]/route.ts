// Returns overview: LA, latest rates, documents, term dates
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { slug: string }}) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: la, error: laErr } = await supabase
    .from("local_authorities")
    .select("id, slug, name, country")
    .ilike("slug", params.slug)
    .maybeSingle();
  if (laErr) return NextResponse.json({ error: laErr.message }, { status: 500 });
  if (!la) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Latest rates with entitlement code
  const { data: rates, error: rateErr } = await supabase
    .from("v_la_rates_latest")
    .select("entitlement_id, effective_from, amount_pence, notes, source_url")
    .eq("la_id", la.id);
  if (rateErr) return NextResponse.json({ error: rateErr.message }, { status: 500 });

  const { data: ents, error: entErr } = await supabase
    .from("funding_entitlements")
    .select("id, code, description");
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 });

  const entMap = new Map(ents?.map(e => [e.id, e]) ?? []);
  const ratesResolved = (rates ?? []).map(r => ({
    entitlement_code: entMap.get(r.entitlement_id)?.code ?? null,
    entitlement_description: entMap.get(r.entitlement_id)?.description ?? null,
    effective_from: r.effective_from,
    amount_pence: r.amount_pence,
    notes: r.notes,
    source_url: r.source_url,
  }));

  const { data: terms } = await supabase
    .from("la_term_dates")
    .select("term_name, starts_on, ends_on, academic_year")
    .eq("la_id", la.id)
    .order("starts_on", { ascending: true });

  const { data: docs } = await supabase
    .from("la_documents")
    .select("doc_type, title, version, effective_from, url, notes")
    .eq("la_id", la.id)
    .order("effective_from", { ascending: false });

  return NextResponse.json({
    la,
    latest_rates: ratesResolved,
    term_dates: terms ?? [],
    documents: docs ?? [],
  });
}

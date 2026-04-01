// lib/laResolvers.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export type EntitlementRow = {
  id: string;
  code: string;
  is_active?: boolean;
};

export async function getSupabaseRouteClient() {
  return createRouteHandlerClient({ cookies });
}

function slugifyLa(name: string, country: string) {
  const s = `${name}`.trim().toLowerCase();
  const c = `${country}`.trim().toLowerCase();
  return (s + "-" + c).replace(/[^a-z0-9]+/g, "-");
}

function stripCouncilWords(s: string) {
  return s
    .replace(/\b(metropolitan\s+borough|county|city|borough)\s+council\b/gi, "")
    .replace(/\bcouncil\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Resolves LA by name+country with multiple fallbacks:
// 1) exact ILIKE name+country
// 2) slug match (same logic as DB slugify_la)
// 3) contains match on stripped name (remove "County/City/Borough Council")
export async function resolveLaIdByNameCountry(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  name: string,
  country: string
): Promise<string | null> {
  const n = name?.trim() ?? "";
  const c = country?.trim() ?? "";
  if (!n || !c) return null;

  // #1 exact ILIKE
  {
    const { data, error } = await supabase
      .from("local_authorities")
      .select("id, name, country")
      .ilike("name", n)
      .ilike("country", c)
      .limit(1)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST102") throw error;
    if (data?.id) return data.id;
  }

  // #2 slug match
  {
    const slug = slugifyLa(n, c);
    const { data, error } = await supabase
      .from("local_authorities")
      .select("id, slug")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST102") throw error;
    if (data?.id) return data.id;
  }

  // #3 contains match with stripped name (tolerates "X City Council" vs "City of X")
  {
    const n2 = stripCouncilWords(n);
    const { data, error } = await supabase
      .from("local_authorities")
      .select("id, name, country")
      .ilike("name", `%${n2}%`)
      .ilike("country", `%${c}%`)
      .limit(1)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST102") throw error;
    if (data?.id) return data.id;
  }

  return null;
}

export async function resolveEntitlementIdByCode(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  code: string
): Promise<string | null> {
  const lc = (code ?? "").trim().toLowerCase();
  if (!lc) return null;

  // funding_entitlements first
  {
    const { data, error } = await supabase
      .from("funding_entitlements")
      .select("id, code")
      .ilike("code", lc)
      .limit(1)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST102") throw error;
    if (data?.id) return data.id;
  }

  // fallback to entitlements if present
  const { data: d2, error: e2 } = await supabase
    .from("entitlements")
    .select("id, code")
    .ilike("code", lc)
    .limit(1)
    .maybeSingle();
  if (e2 && (e2 as any).code !== "PGRST102") throw e2;
  return d2?.id ?? null;
}

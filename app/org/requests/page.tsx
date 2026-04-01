import RequestsClient from "./RequestsClient";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export default async function OrgRequests({
  searchParams,
}: {
  searchParams?: { nursery_id?: string };
}) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set(n, v, o as any),
        remove: (n, o) => cookieStore.set(n, "", { ...(o as any), maxAge: 0 }),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id")
    .eq("user_id", user!.id);

  const orgId = (grants || []).find(g => g.role === "ORG_ADMIN")?.org_id ?? null;

  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const options = (nurseries ?? []).map(n => ({ id: n.id, name: n.name }));

  const fromQuery = searchParams?.nursery_id;
  const isValid = !!options.find(o => o.id === fromQuery);
  const initialNurseryId = isValid ? fromQuery! : (options[0]?.id ?? null);

  return <RequestsClient nurseries={options} initialNurseryId={initialNurseryId} />;
}

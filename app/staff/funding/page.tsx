import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ScopeProvider } from "@/components/scope/ScopeProvider";
import FundingClient from "@/app/org/funding/FundingClient";

export const dynamic = "force-dynamic";

async function getNurseryIdForCurrentUser(): Promise<string | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...o }),
        remove: (n, o) => cookieStore.set({ name: n, value: "", ...o, maxAge: 0 }),
      },
    }
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data: prof } = await supabase
    .from("profiles")
    .select("nursery_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  return prof?.nursery_id ?? null;
}

export default async function StaffFundingPage() {
  const nurseryId = await getNurseryIdForCurrentUser();

  // ScopeProvider is kept so any components that rely on it still work,
  // but we also pass the id directly to FundingClient to guarantee it’s present.
  return (
    <ScopeProvider>
      <FundingClient nurseryIdOverride={nurseryId ?? undefined} />
    </ScopeProvider>
  );
}

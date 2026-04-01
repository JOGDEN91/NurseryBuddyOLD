// app/admin/parameters/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import EntitlementsClient from "./EntitlementsClient";

export const dynamic = "force-dynamic";

export default async function ParametersPage() {
  // SSR Supabase with cookies bridge (no user!.id without guard)
  const jar = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          jar.set({ name, value, ...(options as any) });
        },
        remove(name: string, options: any) {
          jar.set({ name, value: "", ...(options as any), maxAge: 0 });
        },
      },
    }
  );

  // Load funding entitlements (incl. is_active)
  let entitlements: any[] = [];
  let serverError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("funding_entitlements")
      .select(
        [
          "id",
          "name",
          "code",
          "description",
          "hours_per_week",
          "weeks_per_year",
          "min_age_months",
          "max_age_months",
          "requires_working_parent",
          "means_tested",
          "is_active",
        ].join(", ")
      )
      .order("min_age_months", { ascending: true });
    if (error) throw error;
    entitlements = data ?? [];
  } catch (e: any) {
    serverError = e?.message || "Failed to load entitlements";
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Parameters</h1>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Funding entitlements</h2>
        <p style={{ margin: 0, color: "#555" }}>
          Manage funding <b>hour blocks</b> (15h each). Define age bands and flags.
          Codes are used to match Local Authority/HMRC rates to a band.
        </p>

        <div
          style={{
            background: "#fff",
            border: "1px solid #E6E4E0",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <EntitlementsClient entitlements={entitlements} serverError={serverError} />
        </div>
      </section>
    </div>
  );
}

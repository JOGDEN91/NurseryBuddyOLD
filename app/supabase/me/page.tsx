  import { createSupabaseServer } from "@/lib/supabase/server";

  export const dynamic = "force-dynamic";

  export default async function Me() {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    let profile: any = null;
    if (user) {
      const { data } = await supabase.from("app_profiles").select("*").eq("id", user.id).maybeSingle();
      profile = data;
    }

    return (
      <main style={{ padding: 24 }}>
        <h1>Supabase: Me</h1>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 8 }}>
{JSON.stringify({ user, profile }, null, 2)}
        </pre>
        {!user && <p>Not signed in.</p>}
      </main>
    );
  }

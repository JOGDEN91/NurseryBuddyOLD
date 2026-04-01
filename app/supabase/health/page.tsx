import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupabaseHealth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : "missing";

  let serverClientOk = false;
  let authUserOk = "n/a";
  let error: string | null = null;

  try {
    const supabase = createSupabaseServer();
    serverClientOk = true;
    const { data: { user } } = await supabase.auth.getUser();
    authUserOk = user ? "present" : "null (expected)";
  } catch (e:any) {
    error = e?.message || "Unknown error";
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Supabase: Health</h1>
      <ul style={{ lineHeight: 2 }}>
        <li>URL detected: <b>{url ? "yes" : "no"}</b></li>
        <li>Anon key loaded: <b>{anon}</b></li>
        <li>Server client created: <b>{serverClientOk ? "yes" : "no"}</b></li>
        <li>auth.getUser(): <b>{authUserOk}</b></li>
      </ul>
      {error && (
        <p style={{ color: "red" }}>Error: {error}</p>
      )}
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        If URL or anon key shows "no/missing", set them in <code>.env.local</code> and restart dev server.
      </p>
    </main>
  );
}

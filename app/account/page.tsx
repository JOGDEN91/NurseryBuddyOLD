import { createSupabaseServer } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ padding: 24 }}>
      <h1>Account</h1>
      {user ? (
        <>
          <p>Signed in as <b>{user.email}</b></p>
          <form action="/auth/sign-out" method="post">
            <button style={{ padding: 10, borderRadius: 8, background: "black", color: "white" }}>Sign out</button>
          </form>
        </>
      ) : (
        <p>Not signed in.</p>
      )}
    </main>
  );
}

// app/admin/sign-in/page.tsx
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function AdminSignIn() {
  const supabase = createClientComponentClient();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Where to go after login; middleware gates SUPER_ADMIN
  const redirectTo = sp.get("redirect") ?? "/admin/overview";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setLoading(true);

    // 1) Client sign-in with password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    // 2) Get the fresh session and push tokens to the server via /auth/finalize
    const session = data.session ?? (await supabase.auth.getSession()).data.session;
    const access = session?.access_token;
    const refresh = session?.refresh_token;

    if (!access || !refresh) {
      setErr("No session returned. Please try again.");
      setLoading(false);
      return;
    }

    // Server will write cookies and redirect to admin overview (or provided redirect)
    window.location.href =
      `/auth/finalize?access_token=${encodeURIComponent(access)}&refresh_token=${encodeURIComponent(refresh)}&next=${encodeURIComponent(redirectTo)}`;
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 p-6 rounded-2xl shadow bg-white">
        <h1 className="text-2xl font-semibold">Admin sign in</h1>

        <input
          className="w-full border rounded-xl p-3"
          type="email"
          placeholder="admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        <input
          className="w-full border rounded-xl p-3"
          type="password"
          placeholder="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button className="w-full rounded-xl p-3 bg-black text-white disabled:opacity-50" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <p className="text-xs text-gray-500">
          Parents & nurseries: use{" "}
          <a className="underline" href="/auth/choose">the main sign-in</a>.
        </p>
      </form>
    </div>
  );
}

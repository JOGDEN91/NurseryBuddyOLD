// app/auth/parent/sign-in/page.tsx
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ParentSignIn() {
  const supabase = createClientComponentClient();
  const qp = useSearchParams();
  const redirectParam = qp.get("redirect");
  const emailParam = qp.get("email");

  const [email, setEmail] = useState(emailParam || "");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setOtpSent(true);
    setLoading(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const session = data.session ?? (await supabase.auth.getSession()).data.session;
    const access = session?.access_token;
    const refresh = session?.refresh_token;

    if (!access || !refresh) {
      setErr("No session returned. Please try again.");
      setLoading(false);
      return;
    }

    const next = redirectParam || "/parent/dashboard";
    window.location.href =
      `/auth/finalize?access_token=${encodeURIComponent(access)}&refresh_token=${encodeURIComponent(refresh)}&next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md space-y-4 p-6 rounded-2xl shadow bg-white">
        <h1 className="text-2xl font-semibold">Parent sign in</h1>

        {!otpSent ? (
          <form onSubmit={requestOtp} className="space-y-3">
            <input
              className="w-full border rounded-xl p-3"
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="w-full rounded-xl p-3 bg-black text-white disabled:opacity-50" disabled={loading}>
              {loading ? "Sending code…" : "Send code"}
            </button>
            <p className="text-xs text-gray-500">We’ll email you a 6-digit code.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <input
              className="w-full border rounded-xl p-3 tracking-widest text-center"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
            <button className="w-full rounded-xl p-3 bg-black text-white disabled:opacity-50" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              className="w-full rounded-xl p-3 border"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
              }}
            >
              Resend / change email
            </button>
          </form>
        )}

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="text-xs text-gray-500 text-center">
          <a className="underline" href="/auth/sign-out">Switch account</a>
        </div>
      </div>
    </div>
  );
}

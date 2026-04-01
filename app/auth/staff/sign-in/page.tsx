// app/auth/staff/sign-in/page.tsx
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

export default function StaffSignIn() {
  const supabase = createClientComponentClient();
  const qp = useSearchParams();
  const redirectParam = qp.get("redirect");

  const [email, setEmail] = useState("");
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

    const next = redirectParam || "/staff/dashboard";
    window.location.href =
      `/auth/finalize?access_token=${encodeURIComponent(access)}&refresh_token=${encodeURIComponent(
        refresh
      )}&next=${encodeURIComponent(next)}`;
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "#24364B", color: "#FFFFFF" }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="grid place-items-center">
          <Image
            src="/nursery-buddy-logo.png"
            alt="Nursery Buddy"
            width={220}
            height={80}
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Card */}
        <div
          className="w-full rounded-2xl p-6 space-y-4"
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <h1 className="text-2xl font-semibold">Staff Sign-In</h1>

          {!otpSent ? (
            <form onSubmit={requestOtp} className="space-y-3">
              <input
                className="w-full rounded-xl p-3 bg-white text-black placeholder-gray-500"
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                className="w-full rounded-xl p-3 font-semibold text-white disabled:opacity-50 transition"
                style={{ background: "#4CAF78" }}
                disabled={loading}
              >
                {loading ? "Sending code…" : "Send code"}
              </button>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>
                We’ll email you a 6-digit code.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <input
                className="w-full rounded-xl p-3 bg-white text-black placeholder-gray-500 tracking-widest text-center"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
              />
              <button
                className="w-full rounded-xl p-3 font-semibold text-white disabled:opacity-50 transition"
                style={{ background: "#4CAF78" }}
                disabled={loading}
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                className="w-full rounded-xl p-3 transition"
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#FFFFFF",
                }}
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                }}
              >
                Resend / change email
              </button>
            </form>
          )}

          {err && <div className="text-sm text-red-400">{err}</div>}

          <div className="text-xs text-center" style={{ color: "rgba(255,255,255,0.8)" }}>
            <a className="underline" href="/auth/choose">
              Switch account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

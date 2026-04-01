"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type View = "request" | "verify";

export default function CodeSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [view, setView] = useState<View>("request");
  const [error, setError] = useState<string|null>(null);
  const [info, setInfo] = useState<string|null>(null);
  const router = useRouter();
  const supabase = supabaseBrowser();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    if (error) setError(error.message);
    else {
      setInfo("We emailed you a 6-digit code. Enter it below.");
      setView("verify");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    const { data, error } = await supabase.auth.verifyOtp({
      type: "email",
      email,
      token: code
    });
    if (error) setError(error.message);
    else router.replace("/account");
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 420 }}>
      <h1>Sign in with a code</h1>
      {view === "request" && (
        <form onSubmit={sendCode} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
            style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <button type="submit" style={{ padding: 10, borderRadius: 8, background: "black", color: "white" }}>
            Send code
          </button>
        </form>
      )}
      {view === "verify" && (
        <form onSubmit={verifyCode} style={{ display: "grid", gap: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e)=>setCode(e.target.value)}
            required
            style={{ letterSpacing: 2, padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <button type="submit" style={{ padding: 10, borderRadius: 8, background: "black", color: "white" }}>
            Verify & sign in
          </button>
          <button type="button" onClick={()=>setView("request")} style={{ padding: 10, borderRadius: 8 }}>
            Resend code
          </button>
        </form>
      )}
      {info && <p>{info}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p><a href="/auth/sign-in">Use magic link instead</a></p>
    </main>
  );
}

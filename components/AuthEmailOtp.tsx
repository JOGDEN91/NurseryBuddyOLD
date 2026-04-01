"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthEmailOtp() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"enterEmail"|"enterCode">("enterEmail");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);
  const router = useRouter();

  async function sendCode() {
    setLoading(true); setMsg(null);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false, // change to true if you allow signups here
        },
      });
      if (error) throw error;
      setPhase("enterCode");
      setMsg("We’ve emailed you a 6-digit code.");
    } catch (e:any) {
      setMsg(e.message || "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true); setMsg(null);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      // success → go home; server middleware will route to parent/staff dashboard
      router.push("/");
      router.refresh();
    } catch (e:any) {
      setMsg(e.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>

      {phase === "enterEmail" && (
        <>
          <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              placeholder="you@nursery.co.uk"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <button
            disabled={!email || loading}
            onClick={sendCode}
            style={{ padding: "10px 14px", borderRadius: 8, background: "black", color: "white" }}
          >
            {loading ? "Sending…" : "Send code"}
          </button>
        </>
      )}

      {phase === "enterCode" && (
        <>
          <p>Enter the 6-digit code sent to <b>{email}</b></p>
          <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span>Code</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e=>setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              style={{ letterSpacing: 6, fontWeight: 700, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={!code || loading}
              onClick={verifyCode}
              style={{ padding: "10px 14px", borderRadius: 8, background: "black", color: "white" }}
            >
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button onClick={()=>setPhase("enterEmail")} style={{ padding: "10px 14px", borderRadius: 8 }}>
              Use another email
            </button>
          </div>
        </>
      )}

      {msg && <p style={{ marginTop: 12, color: "#374151" }}>{msg}</p>}
    </div>
  );
}
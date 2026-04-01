"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function DevLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [error, setError] = useState<string|null>(null);
  const router = useRouter();
  const supabase = supabaseBrowser();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/account");
    } catch (err:any) {
      setError(err.message || "Auth error");
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 420 }}>
      <h1>Dev Login (email + password)</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={()=>setMode("signin")} style={{ padding: 8, borderRadius: 6, background: mode==="signin" ? "black" : "#eee", color: mode==="signin" ? "white" : "black" }}>Sign in</button>
        <button onClick={()=>setMode("signup")} style={{ padding: 8, borderRadius: 6, background: mode==="signup" ? "black" : "#eee", color: mode==="signup" ? "white" : "black" }}>Sign up</button>
      </div>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required
          placeholder="you@example.com" style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <input
          type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required
          placeholder="password" style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <button type="submit" style={{ padding: 10, borderRadius: 8, background: "black", color: "white" }}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
      <p><a href="/auth/sign-in">Use magic link</a> · <a href="/auth/code-sign-in">Use 6-digit code</a></p>
    </main>
  );
}

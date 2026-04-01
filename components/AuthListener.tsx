// components/AuthListener.tsx
"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AuthListener() {
  const supabase = createClientComponentClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          await fetch("/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event, session }),
            cache: "no-store",
            credentials: "include",
          });
        } catch {
          // ignore during dev
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [supabase]);

  return null;
}

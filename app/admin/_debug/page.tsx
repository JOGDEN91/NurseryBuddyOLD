"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AdminDebug() {
  const supabase = createClientComponentClient();
  const [clientUser, setClientUser] = useState<any>(null);
  const [serverUser, setServerUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setClientUser(user ?? null);

      const res = await fetch("/api/debug/session", { cache: "no-store" });
      const json = await res.json();
      setServerUser(json.user ?? null);
    })();
  }, []);

  return (
    <pre style={{ whiteSpace: "pre-wrap" }}>
{JSON.stringify({ clientUser, serverUser }, null, 2)}
    </pre>
  );
}

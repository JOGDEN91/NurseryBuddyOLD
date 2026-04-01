"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ProfileForm({
  initialDisplayName,
  initialNurseryId,
}: {
  initialDisplayName: string;
  initialNurseryId: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nurseryId, setNurseryId] = useState(initialNurseryId);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName,
        nursery_id: nurseryId || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error || "Failed to save profile");
      setStatus("error");
      return;
    }

    setStatus("saved");
    router.refresh(); // reload server-rendered profile JSON below
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <label>
        <div>Display name</div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }}
        />
      </label>
      <label>
        <div>Nursery ID (uuid or text for now)</div>
        <input
          value={nurseryId}
          onChange={(e) => setNurseryId(e.target.value)}
          style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, width: "100%" }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="submit"
          disabled={status === "saving"}
          style={{ padding: 10, borderRadius: 8, background: "black", color: "white", width: 160 }}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span>Saved ✅</span>}
        {status === "error" && <span style={{ color: "red" }}>{error}</span>}
      </div>
    </form>
  );
}
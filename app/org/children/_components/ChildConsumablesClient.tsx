"use client";

import React, { useEffect, useMemo, useState } from "react";

/** Kept for compatibility if other code imports it */
export function hoursToBand(hours: number | null | undefined): 0 | 15 | 30 {
  const h = Number(hours ?? 0);
  if (h >= 30) return 30;
  if (h >= 15) return 15;
  return 0;
}

type Item = {
  id: string;
  description: string;
  amount_15: number | null;
  amount_30: number | null;
  scope: "org" | "nursery";
};

export default function ChildConsumablesClient({
  childId,
  bandOverride, // accepted for compatibility, not used for display anymore
}: {
  childId: string;
  bandOverride?: 0 | 15 | 30;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [optedOut, setOptedOut] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/children/${encodeURIComponent(childId)}/consumables`, {
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to load consumables");
      setItems(Array.isArray(j.items) ? j.items : []);
      setOptedOut(j.optedOut || {});
      // NOTE: we ignore j.band now; Finance will handle banded pricing per term.
    } catch (e: any) {
      setMsg(e?.message || "Failed to load consumables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  // Merge by description, prefer nursery>org; we no longer compute/require a band or amounts.
  const displayList = useMemo(() => {
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const buckets = new Map<string, Item[]>();
    for (const it of items) {
      const k = norm(it.description);
      const arr = buckets.get(k) || [];
      arr.push(it);
      buckets.set(k, arr);
    }
    const out = [];
    for (const group of buckets.values()) {
      const nursery = group.find((g) => g.scope === "nursery");
      const org = group.find((g) => g.scope === "org");
      const picked = nursery ?? org ?? group[0];
      out.push({
        key: `${picked.scope}:${picked.id}`,
        scope: picked.scope,
        id: picked.id,
        description: picked.description,
      });
    }
    out.sort((a, b) => a.description.localeCompare(b.description));
    return out;
  }, [items]);

  async function toggle(scope: "org" | "nursery", id: string, next: boolean) {
    const key = `${scope}:${id}`;
    setMsg(null);
    try {
      if (next) {
        const res = await fetch(`/api/children/${encodeURIComponent(childId)}/consumables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ scope, consumable_id: id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Failed to update");
      } else {
        const qs = new URLSearchParams({ scope, consumable_id: id }).toString();
        const res = await fetch(`/api/children/${encodeURIComponent(childId)}/consumables?${qs}`, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Failed to update");
      }
      setOptedOut((o) => ({ ...o, [key]: next }));
    } catch (e: any) {
      setMsg(e?.message || "Update failed");
    }
  }

  if (loading) return <div style={{ opacity: 0.7 }}>Loading consumables…</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {msg && (
        <div
          style={{
            background: "#FFF8E6",
            border: "1px solid #F2D27A",
            color: "#6A4A0C",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {msg}
        </div>
      )}

      {displayList.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No consumables configured.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {displayList.map((it) => (
            <label
              key={it.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                border: "1px solid #E6E4E0",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{it.description}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Opt-outs are stored here. Actual charges are calculated in Finance per term (stacked 15h blocks + your rates).
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Opt-out</span>
                <input
                  type="checkbox"
                  checked={!!optedOut[it.key]}
                  onChange={(e) => toggle(it.scope, it.id, e.currentTarget.checked)}
                />
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

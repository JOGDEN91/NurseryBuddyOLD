// app/org/nursery/overview/OverviewNotificationsClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";

export default function OverviewNotificationsClient() {
  const { nurseryId } = useScope();

  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nurseryId) {
      setUnreadTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        const res = await fetch(
          `/api/org/messages/unread-count?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const j = await res.json().catch(() => ({} as any));

        if (cancelled) return;

        if (res.ok && j.ok !== false && typeof j.total === "number") {
          setUnreadTotal(j.total);
        } else {
          setUnreadTotal(0);
          if (j.error) setError(j.error);
        }
      } catch (e: any) {
        if (!cancelled) {
          setUnreadTotal(0);
          setError(e?.message || "Unable to load notifications.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nurseryId]);

  return (
    <div className="space-y-2 text-[13px] text-gray-900">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] text-gray-600">
          Unread messages (all conversations)
        </div>
        <div className="text-[22px] font-semibold text-emerald-700">
          {loading ? "…" : unreadTotal}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {error}
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        This includes all unread messages across your nursery&apos;s direct
        chats, groups and event threads.
      </p>

      <div className="pt-1 text-right">
        <a
          href="/org/messages"
          className="text-[12px] font-medium text-sky-700 underline"
        >
          Open messages
        </a>
      </div>
    </div>
  );
}
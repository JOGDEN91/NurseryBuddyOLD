// app/org/nursery/overview/OverviewMessagesSnippetClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";

type ConversationKind = "dm" | "group" | "event";

type ConversationSnippet = {
  id: string;
  title: string;
  kind: ConversationKind;
  lastText: string;
  lastFrom: string;
  unreadCount: number;
};

type ApiConversationRow = {
  id: string;
  title: string | null;
  type: string | null;
};

const SAMPLE_SNIPPETS: ConversationSnippet[] = [
  {
    id: "c1",
    title: "Tiggers Main – Parents",
    kind: "group",
    lastText: "Don’t forget it’s fancy dress on Friday!",
    lastFrom: "Nursery",
    unreadCount: 3,
  },
  {
    id: "c2",
    title: "Ellie’s Parents",
    kind: "dm",
    lastText: "Thank you – that’s really helpful.",
    lastFrom: "Parent",
    unreadCount: 0,
  },
  {
    id: "c3",
    title: "Spring Parent Evening",
    kind: "event",
    lastText: "We have 12 RSVPs so far.",
    lastFrom: "Nursery",
    unreadCount: 1,
  },
];

export default function OverviewMessagesSnippetClient() {
  const { nurseryId } = useScope();

  const [items, setItems] = useState<ConversationSnippet[]>(SAMPLE_SNIPPETS);
  const [usingSample, setUsingSample] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nurseryId) {
      setItems(SAMPLE_SNIPPETS);
      setUsingSample(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);

        // 1) Unread counts
        const unreadRes = await fetch(
          `/api/org/messages/unread-count?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const unreadJson = await unreadRes.json().catch(() => ({} as any));

        const unreadMap: Record<string, number> =
          unreadRes.ok && unreadJson.ok !== false && unreadJson.by_conversation
            ? (unreadJson.by_conversation as Record<string, number>)
            : {};

        // 2) Conversations
        const convRes = await fetch(
          `/api/org/messages/conversations?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const convJson = await convRes.json().catch(() => ({} as any));

        if (cancelled) return;

        if (
          !convRes.ok ||
          convJson.ok === false ||
          !Array.isArray(convJson.conversations) ||
          convJson.conversations.length === 0
        ) {
          // stay on sample
          setItems(SAMPLE_SNIPPETS);
          setUsingSample(true);
          return;
        }

        const mapped: ConversationSnippet[] = (
          convJson.conversations as ApiConversationRow[]
        ).map((row) => {
          const kindRaw = (row.type || "").toLowerCase();
          const kind: ConversationKind =
            kindRaw === "dm" || kindRaw === "group" || kindRaw === "event"
              ? (kindRaw as ConversationKind)
              : "group";

          return {
            id: row.id,
            title: row.title || "Untitled chat",
            kind,
            lastText: "No messages yet.",
            lastFrom: "—",
            unreadCount: unreadMap[row.id] ?? 0,
          };
        });

        setItems(mapped.slice(0, 3));
        setUsingSample(false);
      } catch {
        if (!cancelled) {
          setItems(SAMPLE_SNIPPETS);
          setUsingSample(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nurseryId]);

  return (
    <div className="space-y-2 text-[13px] text-gray-900">
      {loading && (
        <div className="text-[11px] text-gray-500">Loading inbox…</div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-[11px] text-gray-500">
          No conversations yet. Messages will appear here once you start using
          the inbox.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-1">
          {items.map((conv) => {
            const kindLabel =
              conv.kind === "dm"
                ? "Direct"
                : conv.kind === "group"
                ? "Group"
                : "Event";

            const unread = conv.unreadCount > 0;

            return (
              <a
                key={conv.id}
                href="/org/messages"
                className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-[12px] hover:bg-gray-100"
              >
                {/* Avatar */}
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
                  {conv.title.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="truncate text-[12px] font-semibold text-gray-900">
                      {conv.title}
                    </div>
                    {usingSample && (
                      <div className="shrink-0 text-[10px] text-gray-400">
                        {/* placeholder time in sample data */}
                        {conv.title.includes("Parents")
                          ? "09:14"
                          : conv.title.includes("Evening")
                          ? "Mon"
                          : "Yesterday"}
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
                      {kindLabel}
                    </span>
                    {unread && (
                      <span className="text-[10px] text-red-600">
                        {conv.unreadCount} unread
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-500">
                    <span className="font-medium">
                      {conv.lastFrom}:
                    </span>{" "}
                    {conv.lastText}
                  </div>
                </div>

                {unread && (
                  <span className="mt-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}

      <div className="pt-1 text-right">
        <a
          href="/org/messages"
          className="text-[12px] font-medium text-sky-700 underline"
        >
          Open full inbox
        </a>
      </div>
    </div>
  );
}
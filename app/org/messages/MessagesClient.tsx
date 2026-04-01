// app/org/messages/MessagesClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";
import { useSearchParams } from "next/navigation";
import { useOrgMeta } from "../_components/OrgMetaContext";
import { OrgContextStrip } from "../_components/OrgContextStrip";

type ConversationKind = "dm" | "group" | "event";

type Conversation = {
  id: string;
  title: string;
  kind: ConversationKind;
  nurseryName?: string | null;
  lastMessage: {
    text: string;
    at: string;
    fromName: string;
  };
  unreadCount: number;
  isMuted?: boolean;
  isPinned?: boolean;
};

type MessageSide = "me" | "them" | "system";

type Message = {
  id: string;
  conversationId: string;
  side: MessageSide;
  senderName?: string | null;
  text: string;
  createdAt: string;
};

type EventSummary = {
  id: string;
  title: string;
  date: string;
  time: string;
  location?: string;
  conversationId: string;
  rsvpYes: number;
  rsvpNo: number;
  rsvpMaybe: number;
};

type ApiConversationRow = {
  id: string;
  title: string | null;
  type: string | null;
};

type ApiMessageRow = {
  id: string;
  conversation_id: string;
  text: string;
  created_at: string;
  side: MessageSide;
  sender_name?: string | null;
};

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    title: "Tiggers Main – Parents",
    kind: "group",
    nurseryName: "Tiggers Main",
    lastMessage: {
      text: "Don’t forget it’s fancy dress on Friday!",
      at: "09:14",
      fromName: "Nursery",
    },
    unreadCount: 0,
    isPinned: true,
  },
  {
    id: "c2",
    title: "Ellie’s Parents",
    kind: "dm",
    nurseryName: "Tiggers Main",
    lastMessage: {
      text: "Thank you – that’s really helpful.",
      at: "Yesterday",
      fromName: "Parent",
    },
    unreadCount: 0,
  },
  {
    id: "c3",
    title: "Spring Parent Evening",
    kind: "event",
    nurseryName: "Tiggers Main",
    lastMessage: {
      text: "We have 12 RSVPs so far.",
      at: "Mon",
      fromName: "Nursery",
    },
    unreadCount: 0,
  },
];

const SAMPLE_MESSAGES: Message[] = [
  {
    id: "m1",
    conversationId: "c1",
    side: "system",
    text: "Group created by Tiggers Main nursery.",
    createdAt: "09:00",
  },
  {
    id: "m2",
    conversationId: "c1",
    side: "them",
    senderName: "Nursery",
    text: "Good morning everyone 👋\nJust a reminder that we’re collecting donations for Children in Need this week.",
    createdAt: "09:02",
  },
  {
    id: "m3",
    conversationId: "c1",
    side: "them",
    senderName: "Parent",
    text: "Can we bring cakes in on Thursday?",
    createdAt: "09:05",
  },
  {
    id: "m4",
    conversationId: "c1",
    side: "me",
    senderName: "You",
    text: "Yes, Thursday is perfect – thank you!",
    createdAt: "09:10",
  },
];

const SAMPLE_EVENTS: EventSummary[] = [
  {
    id: "e1",
    title: "Spring Parent Evening",
    date: "Thu 14 Nov",
    time: "17:30–19:00",
    location: "Tiggers Main – Preschool Room",
    conversationId: "c3",
    rsvpYes: 12,
    rsvpNo: 2,
    rsvpMaybe: 4,
  },
  {
    id: "e2",
    title: "Christmas Fundraiser",
    date: "Sat 7 Dec",
    time: "10:00–13:00",
    location: "Tiggers Main – Hall",
    conversationId: "c1",
    rsvpYes: 20,
    rsvpNo: 3,
    rsvpMaybe: 6,
  },
];

export default function MessagesClient() {
  const { nurseryId } = useScope();
  const searchParams = useSearchParams();
  const termId = searchParams.get("term_id") || "";
  const [termLabel, setTermLabel] = useState<string | null>(null);

  const { orgName, nurseries } = useOrgMeta();
  const currentNurseryName =
    nurseries.find((n) => n.id === nurseryId)?.name ?? "Nursery";

  // Conversations + sample toggle
  const [conversations, setConversations] = useState<Conversation[]>(
    SAMPLE_CONVERSATIONS
  );
  const [usingSampleData, setUsingSampleData] = useState(true);

  // Messages
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Unread (per conversation)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const [selectedConversationId, setSelectedConversationId] = useState<string>(
    SAMPLE_CONVERSATIONS[0]?.id ?? ""
  );
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  // ---------- Load conversations (Supabase + fallback) ----------
  useEffect(() => {
    if (!nurseryId) return;

    let cancelled = false;

    async function loadConversations() {
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        const res = await fetch(
          `/api/org/messages/conversations?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;

        if (
          !res.ok ||
          j.ok === false ||
          !Array.isArray(j.conversations) ||
          j.conversations.length === 0
        ) {
          // Use sample data
          setConversations(SAMPLE_CONVERSATIONS);
          setMessages(SAMPLE_MESSAGES);
          setUsingSampleData(true);
          setSelectedConversationId(SAMPLE_CONVERSATIONS[0]?.id ?? "");
          return;
        }

        const apiRows: ApiConversationRow[] = j.conversations;

        const mapped: Conversation[] = apiRows.map((row) => ({
          id: row.id,
          title: row.title || "Untitled chat",
          kind:
            (row.type as ConversationKind | null) === "dm" ||
            (row.type as ConversationKind | null) === "group" ||
            (row.type as ConversationKind | null) === "event"
              ? (row.type as ConversationKind)
              : "group",
          nurseryName: currentNurseryName,
          lastMessage: {
            text: "No messages yet.",
            at: "",
            fromName: "—",
          },
          unreadCount: 0,
        }));

        setConversations(mapped);
        setUsingSampleData(false);
        setMessages([]);
        setSelectedConversationId((prev) =>
          prev && mapped.some((c) => c.id === prev)
            ? prev
            : mapped[0]?.id ?? ""
        );
      } catch {
        if (cancelled) return;
        // Fallback to samples on any error
        setConversations(SAMPLE_CONVERSATIONS);
        setMessages(SAMPLE_MESSAGES);
        setUsingSampleData(true);
        setSelectedConversationId(SAMPLE_CONVERSATIONS[0]?.id ?? "");
      }
    }

    loadConversations();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, currentNurseryName]);

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  // Load human-readable term label for the current term_id (for the strip)
  useEffect(() => {
    if (!nurseryId || !termId) {
      setTermLabel(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        params.set("term_id", termId);

        // Re-use the declarations endpoint to get term metadata
        const res = await fetch(
          `/api/org/declarations?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;

        if (!res.ok || j.ok === false || !Array.isArray(j.terms)) {
          setTermLabel(null);
          return;
        }

        const match = j.terms.find((t: any) => t.id === termId);
        setTermLabel(match?.label ?? null);
      } catch {
        if (!cancelled) setTermLabel(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nurseryId, termId]);

  // ---------- Unread counts (per conversation) ----------
  useEffect(() => {
    if (!nurseryId || usingSampleData) {
      setUnreadMap({});
      return;
    }

    let cancelled = false;

    async function loadUnread() {
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

        if (res.ok && j.ok !== false && j.by_conversation) {
          setUnreadMap(j.by_conversation as Record<string, number>);
        } else {
          setUnreadMap({});
        }
      } catch {
        if (!cancelled) setUnreadMap({});
      }
    }

    loadUnread();
    return () => {
      cancelled = true;
    };
  }, [nurseryId, usingSampleData]);

  // ---------- Messages (Supabase when real, sample when usingSampleData) ----------
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    if (usingSampleData) {
      // Keep whatever is in messages (sample + any locally sent)
      return;
    }

    // Only call API if the id looks like a UUID (avoids "c1" errors)
    const isUuid =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        selectedConversationId
      );
    if (!isUuid) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoadingMessages(true);
      setMessagesError(null);

      try {
        const params = new URLSearchParams();
        params.set("conversation_id", selectedConversationId);

        const res = await fetch(
          `/api/org/messages/messages?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );
        const j = await res.json().catch(() => ({} as any));

        if (cancelled) return;

        if (!res.ok || j.ok === false || !Array.isArray(j.messages)) {
          setMessages([]);
          setMessagesError(
            j.error || `Unable to load messages (HTTP ${res.status}).`
          );
          return;
        }

        const apiRows: ApiMessageRow[] = j.messages;

        const mapped: Message[] = apiRows.map((row) => ({
          id: row.id,
          conversationId: row.conversation_id,
          side: row.side,
          senderName: row.sender_name ?? null,
          text: row.text,
          createdAt: new Date(row.created_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }));

        setMessages(mapped);
      } catch (e: any) {
        if (!cancelled) {
          setMessages([]);
          setMessagesError(
            e?.message || "Network error while loading messages."
          );
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, usingSampleData]);

  // ---------- Derived state ----------
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(term)
    );
  }, [conversations, search]);

  const conversationMessages = useMemo(
    () =>
      messages.filter((m) => m.conversationId === selectedConversationId),
    [messages, selectedConversationId]
  );

  // ---------- Send (local only for now) ----------
  function handleSend() {
    const text = draft.trim();
    if (!text || !selectedConversationId) return;

    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");

    const newMsg: Message = {
      id: `local-${now.getTime()}`,
      conversationId: selectedConversationId,
      side: "me",
      senderName: "You",
      text,
      createdAt: `${hh}:${mm}`,
    };

    setMessages((prev) => [...prev, newMsg]);
    setDraft("");
  }

  return (
    <div className="space-y-3 text-[14px] text-gray-900">
      {/* Context strip */}
      <OrgContextStrip
        orgName={orgName}
        nurseryName={currentNurseryName}
        termLabel={termLabel}
      />

      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-[14px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[15px] font-semibold">
              Nursery messages &amp; groups
            </h1>
            <p className="mt-1 text-[12px] text-gray-500">
              Secure messaging between your nursery team and parents, with
              group chats and event threads.
            </p>
            {usingSampleData && (
              <p className="mt-1 text-[11px] text-gray-400">
                Showing sample conversations until the database schema is
                connected.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main layout: conversation list + message thread */}
      <div className="flex flex-col gap-3 md:flex-row">
        {/* Conversation list */}
        <div className="w-full md:w-72">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 text-[14px] shadow-sm">
            {/* Search */}
            <div className="mb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="h-8 w-full rounded-md border border-gray-300 px-2 text-[12px]"
              />
            </div>

            {/* Conversations */}
            <div className="mt-1 space-y-1 text-[13px]">
              {filteredConversations.length === 0 ? (
                <div className="py-2 text-[11px] text-gray-500">
                  No conversations found.
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const active = conv.id === selectedConversationId;
                  const last = conv.lastMessage;

                  const unreadCount = usingSampleData
                    ? conv.unreadCount
                    : unreadMap[conv.id] ?? 0;
                  const unread = unreadCount > 0;

                  const kindLabel =
                    conv.kind === "dm"
                      ? "Direct"
                      : conv.kind === "group"
                      ? "Group"
                      : "Event";

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conv.id)}
                      className={`w-full rounded-xl border px-2 py-2 text-left transition ${
                        active
                          ? "border-sky-300 bg-sky-50"
                          : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Avatar */}
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-semibold text-emerald-800">
                          {conv.title.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="truncate text-[13px] font-semibold text-gray-900">
                              {conv.title}
                            </div>
                            <div className="shrink-0 text-[11px] text-gray-400">
                              {last.at}
                            </div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {kindLabel}
                            </span>
                            {conv.nurseryName && (
                              <span className="truncate text-[10px] text-gray-400">
                                {conv.nurseryName}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-gray-500">
                            <span className="font-medium">
                              {last.fromName}:
                            </span>{" "}
                            {last.text}
                          </div>
                        </div>

                        {unread && (
                          <span className="mt-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Message thread */}
        <div className="flex-1">
          <div className="flex h-[520px] flex-col rounded-2xl border border-gray-200 bg-white text-[14px] shadow-sm">
            {/* Thread header */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
              {selectedConversation ? (
                <>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-semibold text-emerald-800">
                        {selectedConversation.title.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-gray-900">
                          {selectedConversation.title}
                        </div>
                        <div className="truncate text-[11px] text-gray-500">
                          {selectedConversation.kind === "group"
                            ? "Group chat • Parents & nursery staff"
                            : selectedConversation.kind === "event"
                            ? "Event thread • See RSVPs and updates"
                            : "Direct conversation"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden text-[11px] text-gray-400 sm:block">
                    Messages here will be visible to all participants in this
                    conversation.
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-gray-500">
                  Select a conversation from the left to begin.
                </div>
              )}
            </div>

            {/* Messages list */}
            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-[13px]">
              {messagesError && (
                <div className="mb-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  {messagesError}
                </div>
              )}

              {!selectedConversation ? (
                <div className="mt-6 text-center text-[11px] text-gray-500">
                  No conversation selected.
                </div>
              ) : loadingMessages && !usingSampleData ? (
                <div className="mt-6 text-center text-[11px] text-gray-500">
                  Loading messages…
                </div>
              ) : conversationMessages.length === 0 ? (
                <div className="mt-6 text-center text-[11px] text-gray-500">
                  No messages yet. Start the conversation below.
                </div>
              ) : (
                conversationMessages.map((m) => {
                  if (m.side === "system") {
                    return (
                      <div
                        key={m.id}
                        className="flex justify-center text-[10px] text-gray-400"
                      >
                        <span className="rounded-full bg-gray-50 px-2 py-0.5">
                          {m.text}
                        </span>
                      </div>
                    );
                  }

                  const isMe = m.side === "me";

                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${
                          isMe
                            ? "bg-sky-500 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        {!isMe && m.senderName && (
                          <div className="mb-0.5 text-[11px] font-semibold opacity-80">
                            {m.senderName}
                          </div>
                        )}
                        <div className="whitespace-pre-line text-[13px]">
                          {m.text}
                        </div>
                        <div
                          className={`mt-0.5 text-[10px] ${
                            isMe ? "text-sky-100" : "text-gray-400"
                          } text-right`}
                        >
                          {m.createdAt}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-200 px-3 py-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    selectedConversation
                      ? "Type a message to parents..."
                      : "Select a conversation to start messaging"
                  }
                  disabled={!selectedConversation}
                  rows={1}
                  className="max-h-24 flex-1 resize-none rounded-md border border-gray-300 px-2 py-1 text-[13px] disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  type="submit"
                  disabled={!selectedConversation || !draft.trim()}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-[12px] font-medium text-gray-900 shadow-sm disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Events & RSVPs summary (still sample for now) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-[14px] shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[12px] font-semibold text-gray-700">
              Upcoming events
            </div>
            <div className="text-[11px] text-gray-500">
              Parent evenings, fundraisers and information sessions linked to
              their own message threads.
            </div>
          </div>
        </div>

        {SAMPLE_EVENTS.length === 0 ? (
          <div className="py-2 text-[11px] text-gray-500">No events yet.</div>
        ) : (
          <div className="space-y-2">
            {SAMPLE_EVENTS.map((ev) => {
              const total = ev.rsvpYes + ev.rsvpNo + ev.rsvpMaybe || 0;
              return (
                <div
                  key={ev.id}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900">
                      {ev.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      {ev.date} · {ev.time}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      RSVPs:{" "}
                      <span className="font-semibold text-emerald-700">
                        {ev.rsvpYes} yes
                      </span>
                      {", "}
                      <span className="text-gray-600">
                        {ev.rsvpMaybe} maybe
                      </span>
                      {", "}
                      <span className="text-gray-600">
                        {ev.rsvpNo} no
                      </span>
                      {total > 0 && <> · {total} responses total</>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-[12px] font-medium text-gray-900 shadow-sm"
                      onClick={() =>
                        setSelectedConversationId(ev.conversationId)
                      }
                    >
                      Open event chat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
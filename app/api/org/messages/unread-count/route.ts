// app/api/org/messages/unread-count/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nurseryId = url.searchParams.get("nursery_id");

  if (!nurseryId) {
    return NextResponse.json(
      { ok: false, error: "Missing nursery_id" },
      { status: 400 }
    );
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised" },
      { status: 401 }
    );
  }

  const userId = auth.user.id;

  // 1) Fetch messages linked to this nursery (via conversations.nursery_id)
  const { data: messagesData, error: messagesError } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, kind, conversations!inner(nursery_id)")
    .eq("conversations.nursery_id", nurseryId)
    .neq("kind", "system")
    // don't count messages you sent yourself as "unread"
    .or(`sender_id.is.null,sender_id.neq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (messagesError) {
    return NextResponse.json(
      { ok: false, error: messagesError.message },
      { status: 500 }
    );
  }

  const messages = messagesData ?? [];
  if (messages.length === 0) {
    return NextResponse.json({
      ok: true,
      total: 0,
      by_conversation: {},
    });
  }

  const messageIds: string[] = messages
    .map((m: any) => m.id)
    .filter((id: any): id is string => typeof id === "string");

  // 2) Fetch read receipts for this user for those messages
  const readIds = new Set<string>();

  const chunkSize = 200;
  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const { data: readsData, error: readsError } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", chunk);

    if (readsError) {
      return NextResponse.json(
        { ok: false, error: readsError.message },
        { status: 500 }
      );
    }

    for (const row of readsData ?? []) {
      if (row.message_id) {
        readIds.add(row.message_id as string);
      }
    }
  }

  // 3) Compute unread per conversation
  const byConversation: Record<string, number> = {};
  let total = 0;

  for (const m of messages as any[]) {
    const msgId = m.id as string;
    const convId = m.conversation_id as string;
    if (!msgId || !convId) continue;

    if (readIds.has(msgId)) continue;

    total += 1;
    byConversation[convId] = (byConversation[convId] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    total,
    by_conversation: byConversation,
  });
}
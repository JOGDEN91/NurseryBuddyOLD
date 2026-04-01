// app/api/org/messages/messages/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id");

  if (!conversationId) {
    return NextResponse.json(
      { ok: false, error: "Missing conversation_id" },
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

  // Ensure the user is authenticated (RLS still applies)
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised" },
      { status: 401 }
    );
  }

  // Fetch messages for this conversation
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, kind, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  const mapped = rows.map((row) => {
    const isMe = row.sender_id === auth.user.id;
    const side =
      row.kind === "system"
        ? "system"
        : isMe
        ? "me"
        : "them";

    return {
      id: row.id,
      conversation_id: row.conversation_id,
      text: row.body ?? "",
      created_at: row.created_at as string,
      side,
      sender_name: null as string | null, // reserved for later if you want names
    };
  });

  return NextResponse.json({
    ok: true,
    messages: mapped,
  });
}
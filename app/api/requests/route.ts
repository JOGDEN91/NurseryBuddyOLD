import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function bridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: (_n: string, _v: string, _o?: any) => {},
    remove: (_n: string, _o?: any) => {},
  };
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: bridge() }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Try to store in a generic table if you have one; otherwise just ack.
  try {
    await supabase.from("parent_requests").insert({
      user_id: user.id,
      kind: payload.kind || "unknown",
      child_id: payload.child_id ?? null,
      field: payload.field ?? null,
      message: payload.message ?? "",
    });
  } catch {
    // No-op if the table isn't present yet
  }

  return NextResponse.json({ ok: true });
}

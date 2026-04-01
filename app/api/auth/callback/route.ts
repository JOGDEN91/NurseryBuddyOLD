// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const event = body?.event;
  const hasSession = !!body?.session?.access_token;

  // Write session cookies if present
  if (hasSession) {
    await supabase.auth.setSession(body.session);
  }

  // (Temporary) echo back what we saw for debugging
  return NextResponse.json({
    ok: true,
    event,
    sawSession: hasSession,
  });
}

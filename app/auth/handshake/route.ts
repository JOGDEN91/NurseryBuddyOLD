// app/auth/handshake/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Forces a round-trip to the server with the new Supabase auth cookie,
 * then redirects to ?next=...
 */
export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  // Touch the session so auth-helpers attaches/refreshes cookies on the response
  await supabase.auth.getSession();

  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/";

  return NextResponse.redirect(new URL(next, req.url));
}

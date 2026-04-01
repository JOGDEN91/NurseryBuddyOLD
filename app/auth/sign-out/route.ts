// app/auth/sign-out/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

async function doSignOut(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.auth.signOut();

  const url = new URL(req.url);
  const next = url.searchParams.get("next");
  const dest = next && next.startsWith("/") ? next : "/auth/choose";
  return NextResponse.redirect(new URL(dest, url));
}

export const GET = doSignOut;
export const POST = doSignOut;

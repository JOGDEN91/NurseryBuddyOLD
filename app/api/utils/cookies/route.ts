import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name: string;
  value?: string;
  remove?: boolean;
  options?: {
    path?: string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
    expires?: string;
  };
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body?.name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const jar = cookies();
  if (body.remove) jar.set(body.name, "", { ...(body.options as any), maxAge: 0 });
  else jar.set(body.name, body.value ?? "", body.options as any);

  return NextResponse.json({ ok: true });
}

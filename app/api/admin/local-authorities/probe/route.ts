import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });

  try {
    // HEAD first (some sites block HEAD; fall back to GET with manual redirect follow)
    let res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok || !res.headers.get("content-type")) {
      res = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return NextResponse.json({
      ok: true,
      http_status: res.status,
      content_type: res.headers.get("content-type"),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: true, http_status: 0, content_type: null, note: "network error (ignored)" },
      { status: 200 }
    );
  }
}

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const laId: string | undefined = (body.laId ?? body.la_id)?.toString().trim();
  const { section, url, mode } = body;

  if (!laId || !section || !mode) {
    return NextResponse.json(
      { ok: false, error: "laId, section and mode are required" },
      { status: 400 }
    );
  }

  if (section !== "term_dates") {
    return NextResponse.json({ ok: false, error: "Unsupported section" }, { status: 400 });
  }

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      mode: "preview",
      url: url || null,
      confidence: 0.2,
      found: [] as Array<{ term_name: string; start: string; end: string }>,
    });
  }

  if (mode === "apply") {
    return NextResponse.json({
      ok: true,
      mode: "apply",
      url: url || null,
      confidence: 0.2,
      upserted: 0,
      skipped: 0,
      skipped_details: [],
    });
  }

  return NextResponse.json({ ok: false, error: "Unknown mode" }, { status: 400 });
}

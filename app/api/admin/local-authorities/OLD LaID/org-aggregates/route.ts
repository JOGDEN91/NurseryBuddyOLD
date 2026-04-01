import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { laId: string } }) {
  const { searchParams } = new URL(req.url);
  const section = (searchParams.get("section") || "").toLowerCase();

  if (section === "rates") {
    return NextResponse.json({
      ok: true,
      summary: [] as Array<{
        entitlement_id: string;
        entitlement_code?: string | null;
        entitlement_name?: string | null;
        hours_per_week?: number | null;
        total_orgs: number;
        rows: Array<{ rate_hour: number; org_count: number; share: number }>;
      }>,
    });
  }

  if (section === "claim_windows") {
    return NextResponse.json({
      ok: true,
      summary: [] as Array<{
        period_code: string;
        total_orgs: number;
        min_opens?: string | null;
        max_opens?: string | null;
        min_closes?: string | null;
        max_closes?: string | null;
        rows: Array<{ duration_days: number; org_count: number; share: number }>;
      }>,
    });
  }

  return NextResponse.json({ ok: false, error: "Unknown section" }, { status: 400 });
}

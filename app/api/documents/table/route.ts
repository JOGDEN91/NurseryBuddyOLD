// app/api/documents/table/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function makeClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set(name, value, options as any);
        },
        remove(name, options) {
          cookieStore.set(name, "", { ...(options as any), maxAge: 0 });
        },
      },
    }
  );
}

// A stable default ordering if the table is empty or missing
const FALLBACK_LABELS = [
  "Birth certificate",
  "Proof of ID",
  "Proof of address",
  "Funding code letter",
  "Supporting docs",
];

export async function GET(req: Request) {
  try {
    const supabase = makeClient();
    const url = new URL(req.url);
    const nurseryId = url.searchParams.get("nursery_id");
    const includeArchived = url.searchParams.get("include_archived") === "1";

    // 1) Resolve nursery_id if not provided (staff flow)
    let resolvedNurseryId = nurseryId;
    if (!resolvedNurseryId) {
      // get user's current nursery (your RLS helper current_user_nursery() is used elsewhere,
      // but on the server it's fine to fetch the profile)
      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("nursery_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      if (meErr) throw meErr;
      resolvedNurseryId = me?.nursery_id ?? null;
    }

    if (!resolvedNurseryId) {
      return NextResponse.json({ children: [], types: FALLBACK_LABELS.map((label) => ({ label })) });
    }

    // 2) Load the canonical list of document types (by label). No 'code' usage at all.
    let labels: string[] = [];
    {
      const { data: typesRows, error: typesErr } = await supabase
        .from("app_document_types")
        .select("label")
        .order("label", { ascending: true });
      if (typesErr) {
        // fall back silently (keeps page working even if table missing)
        labels = FALLBACK_LABELS;
      } else {
        labels =
          (typesRows?.map((t) => t.label).filter(Boolean) as string[])?.length
            ? (typesRows!.map((t) => t.label) as string[])
            : FALLBACK_LABELS;
      }

      // Enforce preferred order if present
      const want = FALLBACK_LABELS.map((s) => s.toLowerCase());
      labels = [...labels].sort((a, b) => {
        const ia = want.indexOf(a.toLowerCase());
        const ib = want.indexOf(b.toLowerCase());
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    // 3) Load children for the nursery
    const childQuery = supabase
      .from("children")
      .select(
        [
          "id",
          "first_name",
          "last_name",
          "date_of_birth",
          "status",
          "updated_at",
        ].join(",")
      )
      .eq("nursery_id", resolvedNurseryId as string)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (!includeArchived) childQuery.neq("status", "archived");

    const { data: kids, error: kidsErr } = await childQuery;
    if (kidsErr) throw kidsErr;

    // 4) (Lightweight) Look up the latest document file per child per label if available.
    //    If your schema differs (e.g., file table has different names), you can adapt this later.
    //    For now, we default to "missing" so the UI renders; verification comes next.
    const children = (kids || []).map((c) => {
      const docs: Record<
        string,
        { status: "missing" | "requested" | "pending" | "verified" | "review"; url?: string | null; mime?: string | null; updated_at?: string | null }
      > = {};
      labels.forEach((label) => {
        docs[label] = { status: "missing" }; // default until we wire real statuses
      });
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        date_of_birth: c.date_of_birth,
        last_update: c.updated_at,
        docs,
      };
    });

    return NextResponse.json({
      children,
      types: labels.map((label) => ({ label })),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Failed to build documents table" },
      { status: 500 }
    );
  }
}

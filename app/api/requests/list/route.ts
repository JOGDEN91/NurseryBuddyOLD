// app/api/requests/list/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
  };
}

function getSearchParams(req: Request) {
  const idx = req.url.indexOf("?");
  const query = idx === -1 ? "" : req.url.slice(idx + 1);
  return new URLSearchParams(query);
}

// Map internal request types to user-friendly labels
function labelForType(type: string | null | undefined): string {
  const t = (type || "").toLowerCase();
  switch (t) {
    case "parent_invite":
      return "Parent invite";
    case "document_request":
      return "Document request";
    case "funding_code_renewal":
      return "Funding code renewal";
    case "parent_profile":
      return "Parent profile change";
    case "second_parent":
      return "Second parent / carer change";
    case "child_profile":
      return "Child profile change";
    case "child_declaration":
      return "Funding declaration";
    default:
      return type || "Request";
  }
}

export async function GET(req: Request) {
  try {
    const params = getSearchParams(req);
    const nurseryId = params.get("nursery_id") || "";
    const q = (params.get("q") || "").trim().toLowerCase();

    if (!nurseryId) {
      return NextResponse.json(
        { ok: false, error: "nursery_id is required", items: [] },
        { status: 400 }
      );
    }

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in", items: [] },
        { status: 401 }
      );
    }

    // Read from `requests` + join children for child_name
    const { data, error } = await supabase
      .from("requests")
      .select(
        `
        id,
        nursery_id,
        child_id,
        term_id,
        type,
        status,
        updated_at,
        children!inner(
          first_name,
          last_name
        )
      `
      )
      .eq("nursery_id", nurseryId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("requests/list error:", error);
      return NextResponse.json(
        { ok: false, error: error.message, items: [] },
        { status: 500 }
      );
    }

    const items = (data || []).map((row: any) => {
      const childName = `${row.children?.first_name ?? ""} ${
        row.children?.last_name ?? ""
      }`.trim();
      const type = row.type as string | null;
      return {
        id: row.id as string,
        nursery_id: row.nursery_id as string,
        child_id: row.child_id as string,
        term_id: (row.term_id as string | null) ?? null,
        child_name: childName || "—",
        type,
        type_label: labelForType(type),
        status: (row.status as string | null) ?? "open",
        updated_at: row.updated_at as string | null,
      };
    });

    const filtered = !q
      ? items
      : items.filter((r) => {
          const child = (r.child_name || "").toLowerCase();
          const type = (r.type_label || r.type || "").toLowerCase();
          const status = (r.status || "").toLowerCase();
          return (
            child.includes(q) || type.includes(q) || status.includes(q)
          );
        });

    return NextResponse.json(
      { ok: true, items: filtered },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("requests/list unexpected:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error", items: [] },
      { status: 500 }
    );
  }
}
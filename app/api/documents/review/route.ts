// app/api/documents/review/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: () => {},
    remove: () => {},
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { child_id, label, action, note } = body as {
      child_id: string;
      label: string;
      action: "approve" | "request_changes";
      note?: string;
    };

    if (!child_id || !label || !action) {
      return NextResponse.json(
        { ok: false, error: "Missing child_id, label or action" },
        { status: 400 }
      );
    }

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const newStatus = action === "approve" ? "verified" : "review";

    const { data: doc, error: docErr } = await admin
      .from("documents")
      .update({ status: newStatus })
      .eq("child_id", child_id)
      .eq("label", label)
      .select("id, child_id, label, expiry_date")
      .maybeSingle();

    if (docErr || !doc) {
      return NextResponse.json(
        { ok: false, error: docErr?.message || "Document not found" },
        { status: 404 }
      );
    }

    const actorLabel =
      (user.user_metadata?.full_name as string | undefined) ||
      user.email ||
      "Staff";

    // Audit entry
    await admin.from("document_events").insert({
      document_id: doc.id,
      child_id: doc.child_id,
      label: doc.label,
      action: action === "approve" ? "approved" : "changes_requested",
      status: newStatus,
      note: note || null,
      who: actorLabel,
    });

    // Fetch parent user_ids for notifications
    const { data: parentLinks } = await admin
      .from("child_parents")
      .select("parent_id, parents(user_id)")
      .eq("child_id", child_id);

    const parentUserIds = (parentLinks || [])
      .map((row: any) => row.parents?.user_id)
      .filter(Boolean);

    if (parentUserIds.length) {
      const bodyText =
        action === "approve"
          ? `Your '${label}' document has been approved.`
          : `Your '${label}' document needs some changes. Please check the details.`;

      await admin.from("notifications").insert(
        parentUserIds.map((uid: string) => ({
          user_id: uid,
          channel: "parent",
          icon: "document",
          title: "Document update",
          body: bodyText,
          meta: {
            type: action === "approve" ? "doc_approved" : "doc_changes_requested",
            child_id,
            label,
          },
        }))
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("documents/review error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

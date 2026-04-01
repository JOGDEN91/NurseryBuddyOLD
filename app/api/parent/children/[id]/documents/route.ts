// app/api/parent/children/[childId]/documents/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOCUMENTS_BUCKET =
  process.env.NEXT_PUBLIC_DOCUMENTS_BUCKET || "documents";

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: () => {},
    remove: () => {},
  };
}

// Only these labels support expiry
const EXPIRY_LABELS = new Set(["proof of id", "proof of address"]);

// Labels we care about showing on declarations
const INTERESTING_LABELS = [
  "Birth certificate",
  "Proof of ID",
  "Proof of address",
  "Funding code letter",
];

/**
 * GET – return document statuses for this child (for parent view)
 * Shape:
 * { ok: true, items: [ { label, status } ] }
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const childId = params.id;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 1) Check this user is a parent of this child
    const { data: parentRow, error: parentErr } = await supabase
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (parentErr || !parentRow?.id) {
      return NextResponse.json(
        { ok: false, error: "Parent record not found" },
        { status: 403 }
      );
    }

    const { data: linkRow, error: linkErr } = await supabase
      .from("child_parents")
      .select("child_id")
      .eq("parent_id", parentRow.id)
      .eq("child_id", childId)
      .maybeSingle();

    if (linkErr || !linkRow) {
      return NextResponse.json(
        { ok: false, error: "You are not linked to this child" },
        { status: 403 }
      );
    }

    // 2) Use service client to read from documents table
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: docs, error: docsErr } = await admin
      .from("documents")
      .select("child_id,label,status")
      .eq("child_id", childId);

    if (docsErr) {
      console.error("documents select error:", docsErr);
      return NextResponse.json(
        { ok: false, error: "Failed to load documents" },
        { status: 500 }
      );
    }

    const byLabel = new Map<string, string>();
    (docs || []).forEach((row: any) => {
      const label = (row.label as string) || "";
      if (!label) return;
      const key = label.toLowerCase();
      byLabel.set(key, (row.status as string | null) || "pending");
    });

    const items = INTERESTING_LABELS.map((label) => {
      const key = label.toLowerCase();
      const status = byLabel.get(key) || "missing";
      return { label, status };
    });

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (e: any) {
    console.error(
      "Parent-doc statuses GET error:",
      e
    );
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error", items: [] },
      { status: 500 }
    );
  }
}

/**
 * POST – existing upload handler (unchanged)
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const childId = params.id;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 1) Check this user is a parent of this child
    const { data: parentRow, error: parentErr } = await supabase
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (parentErr || !parentRow?.id) {
      return NextResponse.json(
        { ok: false, error: "Parent record not found" },
        { status: 403 }
      );
    }

    const { data: linkRow, error: linkErr } = await supabase
      .from("child_parents")
      .select("child_id")
      .eq("parent_id", parentRow.id)
      .eq("child_id", childId)
      .maybeSingle();

    if (linkErr || !linkRow) {
      return NextResponse.json(
        { ok: false, error: "You are not linked to this child" },
        { status: 403 }
      );
    }

    // 2) Read form data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const labelRaw = (form.get("label") as string | null)?.trim();
    const expiryRaw = (form.get("expiry_date") as string | null)?.trim();

    if (!file || !labelRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing file or label" },
        { status: 400 }
      );
    }

    const label = labelRaw;
    const labelLower = labelRaw.toLowerCase();
    const allowExpiry = EXPIRY_LABELS.has(labelLower);
    const expiryDate = allowExpiry && expiryRaw ? expiryRaw : null;

    // 3) Upload to storage
    const ext = file.name.split(".").pop() || "bin";
    const path = `${childId}/${encodeURIComponent(
      label
    )}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadErr) {
      return NextResponse.json(
        { ok: false, error: uploadErr.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from(DOCUMENTS_BUCKET)
      .getPublicUrl(path);
    const publicUrl = urlData?.publicUrl ?? null;

    // 4) Upsert document row (service client so we can set status / expiry)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: docRow, error: docErr } = await admin
      .from("documents")
      .upsert(
        {
          child_id: childId,
          label, // same label strings used in /api/documents/table
          storage_path: path,
          url: publicUrl,
          mime: file.type || null,
          status: "pending", // parent upload => pending review
          expiry_date: expiryDate, // null for non-expiring docs
        },
        { onConflict: "child_id,label" }
      )
      .select("id, child_id, label")
      .maybeSingle();

    if (docErr) {
      return NextResponse.json(
        { ok: false, error: docErr.message },
        { status: 500 }
      );
    }

    // 5) Audit trail
    await admin.from("document_events").insert({
      document_id: docRow?.id,
      child_id: childId,
      label,
      action: "uploaded",
      status: "pending",
      note: expiryDate ? `Expiry set to ${expiryDate}` : null,
      who: user.email || "Parent",
    });

    // 6) Notification for staff / internal (optional) and parent (confirmation)
    await admin.from("notifications").insert([
      {
        user_id: user.id,
        channel: "parent",
        icon: "document",
        title: "Document uploaded",
        body: `${label} for your child has been uploaded and is awaiting review.`,
        meta: {
          type: "doc_uploaded",
          child_id: childId,
          label,
        },
      },
    ]);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("Parent-doc upload error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
// app/api/documents/request/route.ts

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({
            name,
            value: "",
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );
}

// Existing doc_type -> label mapping
const DOC_LABEL: Record<string, string> = {
  declaration_pdf: "Parent Declaration",
  birth_certificate: "Birth Certificate",
  parent_id: "Parent ID",
  funding_code_letter: "Funding Code Letter",
};

// New: best-effort label -> doc_type mapping for bulk requests
function labelToDocType(label: string): string | null {
  const k = label.trim().toLowerCase();

  if (k === "parent declaration") return "declaration_pdf";
  if (k === "birth certificate") return "birth_certificate";
  if (k === "parent id" || k === "proof of id" || k === "proof of identity")
    return "parent_id";
  if (k === "funding code letter") return "funding_code_letter";

  // "Proof of address" and "Supporting docs" currently have no
  // legacy doc_type in this route, so we skip them rather than guessing.
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  // Common: load staff nursery + name once
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("nursery_id, full_name")
    .eq("id", auth.user.id)
    .single();

  if (profErr || !profile?.nursery_id) {
    return NextResponse.json(
      { error: "No nursery context" },
      { status: 400 }
    );
  }

  const nurseryId = profile.nursery_id as string;

  // ---------- Bulk JSON path from RequestModal ----------
  // shape: { child_ids: string[], labels: string[], notify?: boolean, note?: string }
  if (Array.isArray(body.child_ids) && Array.isArray(body.labels)) {
    const childIds: string[] = body.child_ids.map((x: any) => String(x));
    const labels: string[] = body.labels.map((x: any) => String(x));
    const notify: boolean =
      typeof body.notify === "boolean" ? body.notify : true;
    const note: string | undefined =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : undefined;

    if (!childIds.length || !labels.length) {
      return NextResponse.json(
        { error: "child_ids and labels are required" },
        { status: 400 }
      );
    }

    // Load all relevant children in this nursery
    const { data: children, error: childErr } = await supabase
      .from("children")
      .select("id, first_name, last_name, parent_email")
      .eq("nursery_id", nurseryId)
      .in("id", childIds);

    if (childErr) {
      return NextResponse.json(
        { error: childErr.message },
        { status: 500 }
      );
    }

    const byId = new Map(
      (children ?? []).map((c: any) => [c.id as string, c])
    );

    // For each child + label pair, create document_requests + outbox_emails
    for (const child_id of childIds) {
      const child = byId.get(child_id);
      if (!child) continue;

      const parentEmail = (child.parent_email || "").trim();
      if (!parentEmail) {
        // no parent email on file; skip this child (we still don't hard-fail)
        continue;
      }

      const childName = `${child.first_name ?? ""} ${
        child.last_name ?? ""
      }`.trim() || "your child";

      for (const label of labels) {
        const doc_type = labelToDocType(label);
        if (!doc_type || !DOC_LABEL[doc_type]) {
          // Unknown label for this legacy route; skip rather than breaking
          continue;
        }

        // Insert document_requests row (nursery-scoped)
        const { error: reqErr } = await supabase
          .from("document_requests")
          .insert({
            nursery_id: nurseryId,
            child_id,
            doc_type,
            requested_by: auth.user.id,
            parent_email: parentEmail,
          } as any);

        if (reqErr) {
          // Log but don't blow up the whole batch
          console.error("document_requests insert failed:", reqErr);
        }

        // Queue an email to parent if notify is true
        if (notify) {
          const docName = DOC_LABEL[doc_type];
          const subject = `Nursery Buddy: ${docName} required for ${childName}`;
          const bodyLines = [
            `Hello,`,
            ``,
            `We need your help to complete funding records for ${childName}.`,
            `Please provide: ${docName}.`,
            note ? `` : "",
            note ? `Note from the nursery: ${note}` : "",
            ``,
            `You can reply with the file attached, or upload via your Parent portal (Documents).`,
            ``,
            `Thank you,`,
            `${profile.full_name || "Nursery Team"}`,
          ].filter(Boolean);

          await supabase.from("outbox_emails").insert({
            to_email: parentEmail,
            subject,
            body: bodyLines.join("\n"),
            meta: {
              child_id,
              doc_type,
              label,
              nursery_id: nurseryId,
              requested_by: auth.user.id,
            },
          } as any);
        }

        // Best-effort: add to unified requests table for /org/requests
        try {
          await supabase.from("requests").insert({
            nursery_id: nurseryId,
            child_id,
            parent_id: null,
            type: "document_request",
            status: "requested",
            payload: {
              doc_type,
              label,
              note: note || null,
            },
          } as any);
        } catch (e) {
          // Swallow errors here so missing requests table doesn't break document_requests
          console.warn("requests insert failed (document_request):", e);
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ---------- Existing single-document JSON path ----------
  // shape: { child_id, doc_type }
  const child_id = (body?.child_id ?? "").toString();
  const doc_type = (body?.doc_type ?? "").toString(); // declaration_pdf | birth_certificate | parent_id | funding_code_letter

  if (!child_id || !doc_type || !DOC_LABEL[doc_type]) {
    return NextResponse.json(
      { error: "child_id and valid doc_type are required" },
      { status: 400 }
    );
  }

  const { data: child, error: childErr } = await supabase
    .from("children")
    .select("id, first_name, last_name, parent_email")
    .eq("id", child_id)
    .eq("nursery_id", nurseryId)
    .single();

  if (childErr || !child) {
    return NextResponse.json(
      { error: "Child not found in your nursery" },
      { status: 404 }
    );
  }
  if (!child.parent_email) {
    return NextResponse.json(
      { error: "Child has no parent_email on file" },
      { status: 400 }
    );
  }

  // Insert a request row (nursery-scoped) into document_requests
  const { error: reqErr } = await supabase.from("document_requests").insert({
    nursery_id: nurseryId,
    child_id: child.id,
    doc_type,
    requested_by: auth.user.id,
    parent_email: child.parent_email,
  } as any);
  if (reqErr) {
    return NextResponse.json(
      { error: reqErr.message },
      { status: 500 }
    );
  }

  // Queue an email to parent (wire a worker to send later)
  const childName = `${child.first_name} ${child.last_name}`.trim();
  const docName = DOC_LABEL[doc_type];
  const subject = `Nursery Buddy: ${docName} required for ${childName}`;
  const bodyText = [
    `Hello,`,
    ``,
    `We need your help to complete funding records for ${childName}.`,
    `Please provide: ${docName}.`,
    ``,
    `You can reply with the file attached, or upload via your Parent portal (Documents).`,
    ``,
    `Thank you,`,
    `${profile.full_name || "Nursery Team"}`,
  ].join("\n");

  await supabase.from("outbox_emails").insert({
    to_email: child.parent_email,
    subject,
    body: bodyText,
    meta: {
      child_id: child.id,
      doc_type,
      nursery_id: nurseryId,
      requested_by: auth.user.id,
    },
  } as any);

  // Best-effort: add to unified requests table for /org/requests
  try {
    await supabase.from("requests").insert({
      nursery_id: nurseryId,
      child_id: child.id,
      parent_id: null,
      type: "document_request",
      status: "requested",
      payload: {
        doc_type,
        label: DOC_LABEL[doc_type],
      },
    } as any);
  } catch (e) {
    console.warn("requests insert failed (single document_request):", e);
  }

  // (Optional) add an audit row here, if you keep an audit table

  return NextResponse.json({ ok: true });
}

// app/api/documents/expiry-scan/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DAYS_BEFORE = 14;

export async function POST(req: Request) {
  // simple shared-secret guard
  const key = req.headers.get("x-cron-key");
  if (!key || key !== process.env.DOC_EXPIRY_CRON_KEY) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  const target = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + DAYS_BEFORE
  )
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  // 1) Find documents expiring exactly N days from now
  const { data: docs, error } = await admin
    .from("documents")
    .select("id, child_id, label, expiry_date")
    .eq("status", "verified")
    .eq("expiry_date", target);

  if (error) {
    console.error("expiry-scan error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!docs || docs.length === 0) {
    return NextResponse.json({ ok: true, count: 0 }, { status: 200 });
  }

  // 2) Fetch child names + parent user_ids
  const childIds = Array.from(new Set(docs.map((d) => d.child_id)));

  const { data: children } = await admin
    .from("children")
    .select("id, first_name, last_name")
    .in("id", childIds);

  const { data: links } = await admin
    .from("child_parents")
    .select("child_id, parents(user_id)")
    .in("child_id", childIds);

  const childNameMap = new Map(
    (children || []).map((c: any) => [
      c.id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    ])
  );

  const parentsByChild = new Map<string, string[]>();
  (links || []).forEach((row: any) => {
    const uid = row.parents?.user_id;
    if (!uid) return;
    if (!parentsByChild.has(row.child_id)) parentsByChild.set(row.child_id, []);
    parentsByChild.get(row.child_id)!.push(uid);
  });

  const notifications: any[] = [];
  const events: any[] = [];

  for (const d of docs) {
    const childName = childNameMap.get(d.child_id) || "your child";
    const parents = parentsByChild.get(d.child_id) || [];
    if (!parents.length) continue;

    const body = `${d.label} for ${childName} will expire in ${DAYS_BEFORE} days.`;

    parents.forEach((uid) => {
      notifications.push({
        user_id: uid,
        channel: "parent",
        icon: "document",
        title: "Document expiry reminder",
        body,
        meta: {
          type: "doc_expiry",
          child_id: d.child_id,
          label: d.label,
          days_before: DAYS_BEFORE,
        },
      });
    });

    events.push({
      document_id: d.id,
      child_id: d.child_id,
      label: d.label,
      action: "expiry_warning",
      status: "verified",
      note: body,
      who: "system",
    });
  }

  if (notifications.length) {
    await admin.from("notifications").insert(notifications);
  }
  if (events.length) {
    await admin.from("document_events").insert(events);
  }

  return NextResponse.json(
    { ok: true, count: notifications.length },
    { status: 200 }
  );
}
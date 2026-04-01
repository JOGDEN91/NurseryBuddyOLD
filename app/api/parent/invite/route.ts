// app/api/parent/invite/route.ts
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
    get(name: string) {
      return jar.get(name)?.value;
    },
    set() {}, // RSC: no-op, middleware keeps cookies fresh
    remove() {},
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { child_id } = body as { child_id?: string };

    if (!child_id) {
      return NextResponse.json(
        { ok: false, error: "child_id is required" },
        { status: 400 }
      );
    }

    // Auth as the current staff user (RLS)
    const userClient = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // Service client for cross-table writes (parents, child_parents, requests)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Load the child row
    const { data: child, error: childErr } = await admin
      .from("children")
      .select(
        "id, nursery_id, first_name, last_name, parent_name, parent_email"
      )
      .eq("id", child_id)
      .maybeSingle();

    if (childErr || !child) {
      return NextResponse.json(
        { ok: false, error: "Child not found" },
        { status: 404 }
      );
    }

    const parentEmail = (child.parent_email || "").trim().toLowerCase();
    if (!parentEmail) {
      return NextResponse.json(
        { ok: false, error: "Parent email is missing on this child" },
        { status: 400 }
      );
    }

    const parentName = (child.parent_name || "").trim() || null;

    // 2) Upsert parent record (email is unique)
    const { data: parentRow, error: parentErr } = await admin
      .from("parents")
      .upsert(
        {
          email: parentEmail,
          full_name: parentName,
        },
        { onConflict: "email" }
      )
      .select("id")
      .maybeSingle();

    if (parentErr || !parentRow?.id) {
      return NextResponse.json(
        { ok: false, error: parentErr?.message || "Could not upsert parent" },
        { status: 500 }
      );
    }

    const parentId = parentRow.id;

    // 3) Link child to parent via child_parents
    await admin.from("child_parents").upsert(
      {
        child_id: child.id,
        parent_id: parentId,
        is_primary: true,
      } as any,
      { onConflict: "child_id,parent_id", ignoreDuplicates: true }
    );

    // 4) Create a "parent_invite" request row for the /org/requests page
    // Table shape we expect (you'll need to create this if it doesn't exist):
    // id (uuid), nursery_id, child_id, parent_id, type, status, payload (jsonb), created_at, updated_at
    const { error: reqErr } = await admin.from("requests").insert({
      nursery_id: child.nursery_id,
      child_id: child.id,
      parent_id: parentId,
      type: "parent_invite",
      status: "sent",
      payload: {
        parent_email: parentEmail,
        parent_name: parentName,
        child_name: `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim(),
      },
    } as any);

    if (reqErr) {
      // Non-fatal, but log for you to debug
      console.error("Failed to insert parent_invite request:", reqErr);
    }

    // 5) (Optional) send a real email invite
    // You can plug your email provider here:
    //
    // const inviteLink = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/parent/sign-in?redirect=/parent&email=${encodeURIComponent(parentEmail)}`;
    // await sendInviteEmail({ to: parentEmail, parentName, childName, inviteLink });
    //
    // For now we just return success.

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("parent/invite error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
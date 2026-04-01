// app/api/parent/household/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (name: string) => jar.get(name)?.value,
    set: (name: string, value: string, options?: any) =>
      jar.set({ name, value, ...options }),
    remove: (name: string, options?: any) =>
      jar.set({ name, value: "", ...options, maxAge: 0 }),
  };
}

// GET: read household (single_parent + Parent 2) from the first child
export async function GET(req: Request) {
  try {
    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });

    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Parent row for this user
    const { data: parentRow } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!parentRow) {
      // No parent record yet – return defaults
      return NextResponse.json(
        {
          ok: true,
          single_parent: false,
          parent2_name: "",
          parent2_email: "",
          parent2_nis: "",
          parent2_dob: "",
          has_nursery_connection: false,
        },
        { status: 200 }
      );
    }

    const parentId = parentRow.id as string;

    // 2) Children for this parent
    const { data: links, error: linksErr } = await admin
      .from("child_parents")
      .select(
        `
        child_id,
        children (
          id,
          nursery_id,
          single_parent,
          parent2_name,
          parent2_email,
          parent2_nis,
          parent2_dob
        )
      `
      )
      .eq("parent_id", parentId);

    if (linksErr) {
      return NextResponse.json(
        { ok: false, error: linksErr.message },
        { status: 400 }
      );
    }

    if (!links || !links.length) {
      // No children yet – still return a valid shape so UI works
      return NextResponse.json(
        {
          ok: true,
          single_parent: false,
          parent2_name: "",
          parent2_email: "",
          parent2_nis: "",
          parent2_dob: "",
          has_nursery_connection: false,
        },
        { status: 200 }
      );
    }

    const children = links.map((l: any) => l.children).filter(Boolean);
    const first = children[0] as any;

    const hasNurseryConnection = children.some(
      (c: any) => !!c.nursery_id
    );

    return NextResponse.json(
      {
        ok: true,
        single_parent: !!first?.single_parent,
        parent2_name: first?.parent2_name ?? "",
        parent2_email: first?.parent2_email ?? "",
        parent2_nis: first?.parent2_nis ?? "",
        parent2_dob: first?.parent2_dob ?? "",
        has_nursery_connection: hasNurseryConnection,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// POST: update second parent + single_parent on all children if no nursery yet
export async function POST(req: Request) {
  try {
    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });

    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const {
      single_parent,
      parent2_name,
      parent2_email,
      parent2_nis,
      parent2_dob,
    } = body ?? {};

    // 1) Parent row
    const { data: parentRow } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!parentRow) {
      return NextResponse.json(
        { ok: false, error: "Parent record not found" },
        { status: 404 }
      );
    }

    const parentId = parentRow.id as string;

    // 2) Children for this parent
    const { data: links, error: linksErr } = await admin
      .from("child_parents")
      .select(
        `
        child_id,
        children (
          id,
          nursery_id
        )
      `
      )
      .eq("parent_id", parentId);

    if (linksErr) {
      return NextResponse.json(
        { ok: false, error: linksErr.message },
        { status: 400 }
      );
    }

    if (!links || !links.length) {
      return NextResponse.json(
        { ok: false, error: "No children linked to this parent" },
        { status: 400 }
      );
    }

    const children = links.map((l: any) => l.children).filter(Boolean);
    const hasNurseryConnection = children.some(
      (c: any) => !!c.nursery_id
    );

    // Once a nursery is connected, don't allow silent updates – parent must request
    if (hasNurseryConnection) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Your nursery is linked to at least one child. Please use the 'Request changes' button to update parent / carer details.",
        },
        { status: 400 }
      );
    }

    // 3) No nursery yet – we can safely update all children
    const singleParent = !!single_parent;
    const p2Name = (parent2_name || "").trim();
    const p2Email = (parent2_email || "").trim();
    const p2Nis = (parent2_nis || "").trim();
    const p2Dob = parent2_dob || null;

    const childIds = links.map((l: any) => l.child_id).filter(Boolean);

    const { error: updErr } = await admin
      .from("children")
      .update({
        single_parent: singleParent,
        parent2_name: singleParent ? null : p2Name || null,
        parent2_email: singleParent ? null : p2Email || null,
        parent2_nis: singleParent ? null : p2Nis.toUpperCase() || null,
        parent2_dob: singleParent ? null : p2Dob,
      })
      .in("id", childIds);

    if (updErr) {
      return NextResponse.json(
        {
          ok: false,
          error: updErr.message || "Failed to save parent / carer details.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
// app/api/parent/change-requests/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

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

/**
 * Parent-side endpoint to create change requests that appear in the
 * nursery Requests page (which reads from the `requests` table).
 *
 * Expects JSON:
 *   {
 *     "type": "parent_profile" | "second_parent" | "child_profile",
 *     "message": "Human-readable description",
 *     "payload"?: {
 *       // for child_profile requests:
 *       "child_id": "uuid",
 *       "proposed": {
 *         "first_name"?: string,
 *         "last_name"?: string,
 *         ...any child fields you want to support
 *       }
 *     }
 *   }
 */
export async function POST(req: Request) {
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawType = (body?.type as string | undefined) || "parent_profile";
    const type = rawType.toLowerCase().trim();
    const message = (body?.message as string | undefined) || "";
    const payload = (body?.payload as any) || null;

    if (!message.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please include a description of the changes you would like.",
        },
        { status: 400 }
      );
    }

    // 1) Find parent row for this user
    const { data: parentRow, error: pErr } = await supabase
      .from("parents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr || !parentRow) {
      return NextResponse.json(
        { ok: false, error: "Parent record not found" },
        { status: 404 }
      );
    }

    const parentId = parentRow.id as string;

    // 2) Get linked children with nursery_ids
    const { data: links, error: linksErr } = await supabase
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

    const children = (links || [])
      .map((l: any) => l.children)
      .filter(Boolean) as { id: string; nursery_id: string | null }[];

    if (!children.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No children are linked to your account yet. Please connect to a nursery before requesting changes.",
        },
        { status: 400 }
      );
    }

    // 3) Decide nursery_id + child_id
    let nurseryId: string | null = null;
    let childId: string | null = null;

    if (type === "child_profile") {
      // For child-level requests you should provide a child_id in payload
      const childIdFromPayload = payload?.child_id as string | undefined;
      const targetChild = children.find((c) => c.id === childIdFromPayload) || children[0];

      if (!targetChild?.nursery_id) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This child is not yet linked to a nursery. Please ask your nursery to link the child before requesting changes.",
          },
          { status: 400 }
        );
      }

      nurseryId = targetChild.nursery_id;
      childId = targetChild.id;

      // Basic shape check for proposed fields
      if (!payload?.proposed || typeof payload.proposed !== "object") {
        return NextResponse.json(
          {
            ok: false,
            error: "Child profile requests must include a payload.proposed object.",
          },
          { status: 400 }
        );
      }
    } else {
      // Parent-level requests – just need any child with a nursery to know where to route
      const withNursery = children.find((c) => !!c.nursery_id);
      if (!withNursery?.nursery_id) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No nursery is linked to your children yet. Please connect to a nursery before requesting changes.",
          },
          { status: 400 }
        );
      }
      nurseryId = withNursery.nursery_id;
      childId = null;
    }

    // 4) Insert into `requests` so the nursery Requests page can see it
    const insertData: any = {
      nursery_id: nurseryId,
      child_id: childId,
      type,
      status: "open",
      message,
    };

    if (payload) {
      insertData.payload = payload;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("change_requests")
      .insert(insertData)
      .select("id")
      .single();

    if (insErr) {
      console.error("parent/change-requests insert error:", insErr);
      return NextResponse.json(
        {
          ok: false,
          error:
            insErr.message ||
            "Unable to create change request. Please try again shortly.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: inserted?.id ?? null,
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("parent/change-requests unexpected:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
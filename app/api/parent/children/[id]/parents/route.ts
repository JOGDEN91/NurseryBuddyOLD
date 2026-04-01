// app/api/parent/children/[id]/parents/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

// GET – load existing Parent 1 / Parent 2 details
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
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

    const childId = params.id;

    const { data, error } = await supa
      .from("children")
      .select(
        `
        id,
        single_parent,
        parent1_name,
        parent1_email,
        parent1_nis,
        parent1_dob,
        parent2_name,
        parent2_email,
        parent2_nis,
        parent2_dob,
        nurseries (
          requires_two_parents_details
        )
      `
      )
      .eq("id", childId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "Child not found" },
        { status: 404 }
      );
    }

    const requires_two_parents_details =
      !!data.nurseries?.requires_two_parents_details;

    return NextResponse.json(
      {
        ok: true,
        single_parent: data.single_parent ?? false,
        parent1_name: data.parent1_name ?? "",
        parent1_email: data.parent1_email ?? "",
        parent1_nis: data.parent1_nis ?? "",
        parent1_dob: data.parent1_dob ?? "",
        parent2_name: data.parent2_name ?? "",
        parent2_email: data.parent2_email ?? "",
        parent2_nis: data.parent2_nis ?? "",
        parent2_dob: data.parent2_dob ?? "",
        requires_two_parents_details,
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

// POST – save Parent 1 / Parent 2 details
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
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

    const childId = params.id;
    const body = await req.json().catch(() => ({}));

    const {
      single_parent,
      parent1_name,
      parent1_email,
      parent1_nis,
      parent1_dob,
      parent2_name,
      parent2_email,
      parent2_nis,
      parent2_dob,
    } = body ?? {};

    // Fetch flag to validate correctly
    const { data: childRow, error: childErr } = await supa
      .from("children")
      .select(
        `
        id,
        nurseries (
          requires_two_parents_details
        )
      `
      )
      .eq("id", childId)
      .single();

    if (childErr || !childRow) {
      return NextResponse.json(
        { ok: false, error: "Child not found" },
        { status: 404 }
      );
    }

    const requiresTwoParents =
      !!childRow.nurseries?.requires_two_parents_details;
    const singleParent = !!single_parent;

    // Validation
    const p1Name = (parent1_name || "").trim();
    const p1Nis = (parent1_nis || "").trim();
    const p2Name = (parent2_name || "").trim();
    const p2Nis = (parent2_nis || "").trim();

    if (!p1Name) {
      return NextResponse.json(
        { ok: false, error: "Parent 1 name is required." },
        { status: 400 }
      );
    }
    if (!parent1_dob) {
      return NextResponse.json(
        { ok: false, error: "Parent 1 date of birth is required." },
        { status: 400 }
      );
    }
    if (!p1Nis) {
      return NextResponse.json(
        {
          ok: false,
          error: "Parent 1 National Insurance number is required.",
        },
        { status: 400 }
      );
    }

    if (requiresTwoParents && !singleParent) {
      if (!p2Name) {
        return NextResponse.json(
          { ok: false, error: "Parent 2 name is required." },
          { status: 400 }
        );
      }
      if (!parent2_dob) {
        return NextResponse.json(
          { ok: false, error: "Parent 2 date of birth is required." },
          { status: 400 }
        );
      }
      if (!p2Nis) {
        return NextResponse.json(
          {
            ok: false,
            error: "Parent 2 National Insurance number is required.",
          },
          { status: 400 }
        );
      }
    }

    const { error: updErr } = await supa
      .from("children")
      .update({
        single_parent: singleParent,
        parent1_name: p1Name,
        parent1_email: (parent1_email || "").trim() || null,
        parent1_nis: p1Nis.toUpperCase(),
        parent1_dob: parent1_dob || null,
        parent2_name: singleParent ? null : p2Name || null,
        parent2_email: singleParent
          ? null
          : (parent2_email || "").trim() || null,
        parent2_nis: singleParent ? null : p2Nis.toUpperCase() || null,
        parent2_dob: singleParent ? null : parent2_dob || null,
      })
      .eq("id", childId);

    if (updErr) {
      return NextResponse.json(
        {
          ok: false,
          error: updErr.message || "Failed to save parent details.",
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
// app/api/parent/profile/route.ts
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
    set: (_n: string, _v: string, _o?: any) => {},
    remove: (_n: string, _o?: any) => {},
  };
}

export async function GET(req: Request) {
  try {
    const debug = req.url.includes("debug=1");

    // RLS-aware client just for auth
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

    const meta = user.user_metadata || {};
    const email = user.email || null;

    // Service client to query child_parents -> parents -> children
    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Get children for this parent user via child_parents + parents.user_id
    const { data: rows, error: cpErr } = await admin
      .from("child_parents")
      .select(
        `
        children (
          id,
          first_name,
          last_name,
          photo_url,
          nursery_id,
          date_of_birth,
          gender,
          ethnicity,
          address_line1,
          address_line2,
          town,
          postcode,
          parent1_name,
          parent1_dob,
          parent1_email,
          parent1_nis,
          parent2_name,
          parent2_dob,
          parent2_email,
          parent2_nis,
          parent_phone,
          single_parent,
          hours_mon,
          hours_tue,
          hours_wed,
          hours_thu,
          hours_fri,
          claim_working_parent,
          claim_disadvantaged2,
          nurseries (
            name
          )
        ),
        parents!inner(user_id)
      `
      )
      .eq("parents.user_id", user.id);

    if (cpErr) {
      console.error("parent/profile child_parents error:", cpErr);
      return NextResponse.json(
        { ok: false, error: cpErr.message },
        { status: 500 }
      );
    }

    const childrenRaw = (rows || [])
      .map((r: any) => r.children)
      .filter(Boolean) as any[];

    // 2) Derive parent profile fields from Parent 1 on the first child
    const first = childrenRaw[0] || null;

    const addressParts = first
      ? [
          first.address_line1 || "",
          first.address_line2 || "",
          first.town || "",
          first.postcode || "",
        ]
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];

    const parentPayload = {
      full_name:
        (first?.parent1_name as string | null) ||
        (meta.full_name as string | undefined) ||
        "",
      address: addressParts.join(", "),
      ni_number: (first?.parent1_nis as string | null) || "",
      email:
        (first?.parent1_email as string | null) ||
        (email as string | null) ||
        "",
      phone:
        (first?.parent_phone as string | null) ||
        (meta.phone as string | undefined) ||
        "",
    };

    // 3) Children list for My Children / Documents / Invoices
    const children = childrenRaw.map((c: any) => ({
      id: c.id as string,
      first_name: (c.first_name as string | null) ?? null,
      last_name: (c.last_name as string | null) ?? null,
      photo_url: (c.photo_url as string | null) ?? null,
      nursery_id: (c.nursery_id as string | null) ?? null,
      nursery_name: (c.nurseries?.name as string | null) ?? null,
    }));

    const payload: any = {
      ok: true,
      parent: parentPayload,
      children,
    };

    if (debug) {
      payload.__debug = {
        userId: user.id,
        email,
        count: children.length,
        firstChildId: first?.id ?? null,
        parent1_name: first?.parent1_name ?? null,
        parent1_nis: first?.parent1_nis ?? null,
        parent_phone: first?.parent_phone ?? null,
        addressParts,
      };
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error("/api/parent/profile GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
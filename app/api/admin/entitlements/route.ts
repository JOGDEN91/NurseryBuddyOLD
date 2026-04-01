// app/api/admin/entitlements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function authClient() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) => jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

async function ensureSuperAdmin(sb: ReturnType<typeof createServerClient>) {
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u) return false;
  const role = (u.app_metadata as any)?.role;
  if (typeof role === "string" && role.toLowerCase() === "super_admin") return true;
  try {
    const { data: ok } = await sb.rpc("is_super_admin");
    if (ok === true) return true;
  } catch {}
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const sbAuth = authClient();
    if (!(await ensureSuperAdmin(sbAuth))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const includeInactive =
      new URL(req.url).searchParams.get("include_inactive") === "1";

    const sb = adminClient();
    let q = sb
      .from("funding_entitlements")
      .select(
        "id, name, code, description, hours_per_week, weeks_per_year, min_age_months, max_age_months, requires_working_parent, means_tested, is_active"
      )
      .order("name", { ascending: true });

    if (!includeInactive) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ entitlements: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sbAuth = authClient();
    if (!(await ensureSuperAdmin(sbAuth))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const sb = adminClient();

    const code =
      typeof body.code === "string" && body.code.trim()
        ? body.code.trim().toUpperCase()
        : null;

    const insert = {
      name: body.name ?? null,
      code,
      description: body.description ?? "",
      hours_per_week: body.hours_per_week ?? null,
      weeks_per_year: body.weeks_per_year ?? null,
      min_age_months: body.min_age_months ?? null,
      max_age_months: body.max_age_months ?? null,
      requires_working_parent: !!body.requires_working_parent,
      means_tested: !!body.means_tested,
      is_active: body.is_active ?? true,
    };

    const { data, error } = await sb
      .from("funding_entitlements")
      .insert(insert)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sbAuth = authClient();
    if (!(await ensureSuperAdmin(sbAuth))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    if (!body?.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const sb = adminClient();
    const patch: Record<string, any> = {};
    const allow = new Set([
      "name",
      "code",
      "description",
      "hours_per_week",
      "weeks_per_year",
      "min_age_months",
      "max_age_months",
      "requires_working_parent",
      "means_tested",
      "is_active",
    ]);
    for (const k of Object.keys(body)) {
      if (allow.has(k)) patch[k] = body[k];
    }
    if (typeof patch.code === "string") {
      patch.code = patch.code.trim().toUpperCase();
    }
    if (patch.description == null) patch.description = "";

    const { error } = await sb
      .from("funding_entitlements")
      .update(patch)
      .eq("id", body.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled error" }, { status: 500 });
  }
}

// No DELETE handler — we archive via is_active instead of hard-deleting.

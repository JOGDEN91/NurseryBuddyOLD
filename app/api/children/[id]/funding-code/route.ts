import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set: (n: string, v: string, o?: any) => jar.set({ name: n, value: v, ...o }),
    remove: (n: string, o?: any) => jar.set({ name: n, value: "", ...o, maxAge: 0 }),
  };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code: string | null = body?.code ?? null;
    const expiry_date: string | null = body?.expiry_date ?? null;

    const userClient = createServerClient(URL, ANON, { cookies: cookieBridge() });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    // RLS: ensure user is linked to child via child_parents
    const { data: parentRow } = await userClient.from("parents").select("id").eq("user_id", u.user.id).maybeSingle();
    const parentId = parentRow?.id ?? null;
    if (!parentId) return NextResponse.json({ ok: false, error: "No parent link" }, { status: 403 });

    const { data: link } = await userClient
      .from("child_parents")
      .select("child_id")
      .eq("child_id", params.id)
      .eq("parent_id", parentId)
      .maybeSingle();
    if (!link) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Write with service role (constrained to this child_id)
    const admin = createClient(URL, SERVICE || ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const insert = {
      child_id: params.id,
      code,
      issuer: "HMRC",
      expiry_date: expiry_date,
      valid_from: new Date().toISOString().slice(0, 10),
      // status nullable (enum may vary across deployments)
    };

    const { error } = await admin.from("funding_codes").insert(insert);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

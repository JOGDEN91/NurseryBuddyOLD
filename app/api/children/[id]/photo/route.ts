// app/api/children/[id]/photo/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CHILD_PHOTOS_BUCKET =
  process.env.NEXT_PUBLIC_CHILD_PHOTOS_BUCKET || "child-photos";

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

// ---- Auth + parent↔child link proof (shared) ----
async function assertParentLinked(childId: string) {
  const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: cookieBridge(),
  });
  const { data: userRes } = await supa.auth.getUser();
  const user = userRes?.user;
  if (!user) throw new Error("Not signed in");

  const { data: p } = await supa
    .from("parents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!p?.id) throw new Error("No parent link");

  const { data: link } = await supa
    .from("child_parents")
    .select("child_id")
    .eq("child_id", childId)
    .eq("parent_id", p.id)
    .maybeSingle();
  if (!link) throw new Error("Forbidden");

  return { user, parentId: p.id };
}

// ---------- POST: upload a new image file ----------
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Prove the caller is a linked parent
    await assertParentLinked(params.id);

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Service key missing for upload" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file provided" },
        { status: 400 }
      );
    }
    if (!file.type?.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Only image files are allowed" },
        { status: 400 }
      );
    }
    // 10MB guard
    const sizeMb = (file.size || 0) / (1024 * 1024);
    if (sizeMb > 10) {
      return NextResponse.json(
        { ok: false, error: "Image too large (max 10MB)" },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Derive extension (best-effort)
    const orig = file.name || "image";
    const ext =
      (orig.includes(".") && orig.split(".").pop()) ||
      (file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
        ? "png"
        : "webp");
    const key = `${params.id}/${Date.now()}.${ext}`;

    const ab = await file.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from(CHILD_PHOTOS_BUCKET)
      .upload(key, new Uint8Array(ab), {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (upErr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            upErr.message ||
            `Upload failed (ensure bucket "${CHILD_PHOTOS_BUCKET}" exists & is public)`,
        },
        { status: 400 }
      );
    }

    const { data: pub } = admin.storage
      .from(CHILD_PHOTOS_BUCKET)
      .getPublicUrl(key);
    const photo_url = pub?.publicUrl || null;

    // Persist to children.photo_url (service role, we already proved link)
    const { error: updErr } = await admin
      .from("children")
      .update({ photo_url })
      .eq("id", params.id);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, url: photo_url });
  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    const status =
      msg === "Not signed in" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// ---------- PATCH: set photo_url explicitly ----------
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await assertParentLinked(params.id);
    const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const body = await req.json().catch(() => ({}));
    const url: string | null = body?.photo_url ?? null;

    const { error } = await supa
      .from("children")
      .update({ photo_url: url })
      .eq("id", params.id);

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    const status =
      msg === "Not signed in" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// ---------- DELETE: clear photo_url ----------
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await assertParentLinked(params.id);
    const supa = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: cookieBridge(),
    });

    const { error } = await supa
      .from("children")
      .update({ photo_url: null })
      .eq("id", params.id);

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    const status =
      msg === "Not signed in" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

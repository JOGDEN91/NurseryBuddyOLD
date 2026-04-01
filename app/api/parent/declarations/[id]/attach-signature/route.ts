import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function isPngDataUrl(s: string) {
  return typeof s === "string" && s.startsWith("data:image/png;base64,");
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const declId = ctx.params.id;
  if (!declId) return NextResponse.json({ ok: false, error: "Missing declaration id" }, { status: 400 });

  const body = await req.json().catch(() => ({} as any));
  const fullName = clean(body?.full_name);
  const signatureDataUrl = clean(body?.signature_data_url);
  const signatureMeta = body?.signature_meta ?? null;

  if (!fullName) return NextResponse.json({ ok: false, error: "Please provide your full name." }, { status: 400 });
  if (!isPngDataUrl(signatureDataUrl)) return NextResponse.json({ ok: false, error: "Invalid signature image." }, { status: 400 });

  const { data: decl, error: dErr } = await supabase
    .from("child_declarations")
    .select("id, status, signed_at, signed_by_name, snapshot")
    .eq("id", declId)
    .maybeSingle();

  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 400 });
  if (!decl) return NextResponse.json({ ok: false, error: "Declaration not found." }, { status: 404 });

  const status = String((decl as any).status ?? "").toLowerCase();
  if (status !== "signed") {
    return NextResponse.json(
      { ok: false, error: "This declaration is not signed yet. Please sign it normally first." },
      { status: 400 }
    );
  }

  const prevSnapshot = ((decl as any).snapshot ?? {}) as Record<string, any>;
  const nowIso = new Date().toISOString();

  const prevSig = (prevSnapshot.signature ?? {}) as Record<string, any>;

  // If a drawn signature already exists, avoid overwriting unless you explicitly want that behaviour.
  if (prevSig.data_url) {
    return NextResponse.json({ ok: false, error: "A signature is already stored for this declaration." }, { status: 400 });
  }

  const nextSnapshot = {
    ...prevSnapshot,
    signature: {
      ...prevSig,
      method: "drawn",
      data_url: signatureDataUrl,
      meta: signatureMeta ?? null,

      // Preserve original signed values if present
      signed_by_name: prevSig.signed_by_name ?? (decl as any).signed_by_name ?? fullName,
      signed_at: prevSig.signed_at ?? (decl as any).signed_at ?? nowIso,

      // Attach-event metadata (audit friendly)
      attached_at: nowIso,
      attached_by_parent_id: user.id,
      attached_by_name: fullName,
    },
  };

  const { error: upErr } = await supabase
    .from("child_declarations")
    .update({ snapshot: nextSnapshot })
    .eq("id", declId);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
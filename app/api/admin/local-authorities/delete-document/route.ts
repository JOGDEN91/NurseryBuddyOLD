import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function chooseTable(supabase: any) {
  const { error } = await supabase.from("la_documents").select("id").limit(1);
  return error ? "documents" : "la_documents";
}

export async function POST(req: Request) {
  const { id } = await req.json();
  if (id == null) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set({ name, value, ...options }),
        remove: (name, options) => cookieStore.set({ name, value: "", ...options }),
      },
    }
  );

  const table = await chooseTable(supabase);
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

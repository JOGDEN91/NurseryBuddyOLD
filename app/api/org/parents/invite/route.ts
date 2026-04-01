import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function bridge() {
  const jar = cookies();
  return { get: (n: string) => jar.get(n)?.value, set: (_: any)=>{}, remove: (_: any)=>{} };
}

export async function POST(req: Request) {
  const { orgId, childId, emails } = await req.json().catch(() => ({}));
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: "emails[] required" }, { status: 400 });
  }

  // Authorise caller (staff/admin) with your existing role gates…
  const userClient = createServerClient(URL, ANON, { cookies: bridge() });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  const results: any[] = [];
  for (const email of emails) {
    try {
      const { data: par } = await admin
        .from("parents")
        .upsert({ email }, { onConflict: "email" })
        .select("id,email")
        .single();

      if (childId && par?.id) {
        await admin.from("child_parents").upsert(
          { child_id: childId, parent_id: par.id, is_primary: true, invited_by: user.id },
          { onConflict: "child_id,parent_id" }
        );
      }

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/parent` },
      });
      if (linkErr) throw linkErr;

      await admin.from("parent_invites").insert({
        org_id: orgId ?? null,
        child_id: childId ?? null,
        email,
        invited_by: user.id,
        magic_link: linkData.properties?.action_link ?? null,
        status: "sent",
      });

      results.push({ email, ok: true, link: linkData.properties?.action_link ?? null });
    } catch (e: any) {
      results.push({ email, ok: false, error: e?.message || "invite failed" });
    }
  }

  return NextResponse.json({ ok: true, results });
}

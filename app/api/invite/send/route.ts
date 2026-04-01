// app/api/invite/send/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

type InviteRow = {
  id: string;
  email: string;
  role: string;
  scope: string;
  org_id: string | null;
  nursery_id: string | null;
  token: string;
  sent_at: string | null;
  accepted_at: string | null;
};

async function sendWithResend(to: string, subject: string, html: string, text?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  // Lazy import to avoid bundling when unused
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || "Nursery Funding <no-reply@example.com>";
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  await resend.emails.send({ from, to, subject, html, text, reply_to: replyTo });
  return true;
}

async function sendWithSendGrid(to: string, subject: string, html: string, text?: string) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: (process.env.EMAIL_FROM || "no-reply@example.com").replace(/^.*<|>$/g, "") },
    subject,
    content: [{ type: "text/plain", value: text || "" }, { type: "text/html", value: html }],
  };
  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return true;
}

function baseUrl(reqUrl: string) {
  // Prefer configured site URL, else derive from incoming request
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // 1) Check current user + admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: user.id });
  if (!isAdmin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // 2) Accept JSON or form data
  let inviteId: string | null = null;
  let tokenParam: string | null = null;
  let redirectTo: string | null = null;

  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await request.json().catch(() => ({} as any));
    inviteId = body?.inviteId ?? null;
    tokenParam = body?.token ?? null;
    redirectTo = body?.redirectTo ?? null;
  } else {
    const form = await request.formData();
    inviteId = (form.get("invite_id") as string) || null;
    tokenParam = (form.get("token") as string) || null;
    redirectTo = (form.get("redirectTo") as string) || null;
  }

  if (!inviteId && !tokenParam) {
    return NextResponse.json({ ok: false, error: "Missing inviteId or token" }, { status: 400 });
  }

  // 3) Load invite
  let query = supabase.from("invites").select("*").limit(1);
  if (inviteId) query = query.eq("id", inviteId);
  if (tokenParam) query = query.eq("token", tokenParam);
  const { data: rows, error } = await query.returns<InviteRow[]>();
  if (error || !rows || rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
  }
  const invite = rows[0];

  // 4) Build email contents
  const site = baseUrl(request.url);
  const acceptUrl = `${site}/invite/${invite.token}`;
  const subject = "Your Nursery Funding access invite";
  const text = `You’ve been invited to access Nursery Funding (${invite.role} @ ${invite.scope}).\n\nClick to accept: ${acceptUrl}\n\nIf you didn’t expect this, you can ignore it.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <h2>You're invited</h2>
      <p>You’ve been invited as <strong>${invite.role}</strong> at scope <strong>${invite.scope}</strong>.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none">Accept invite</a></p>
      <p style="color:#666;font-size:12px">If the button doesn’t work, paste this URL into your browser:<br/>
      <a href="${acceptUrl}">${acceptUrl}</a></p>
    </div>
  `;

  // 5) Send via available provider
  let sent = false;
  try {
    sent = (await sendWithResend(invite.email, subject, html, text))
        || (await sendWithSendGrid(invite.email, subject, html, text));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Send failed" }, { status: 500 });
  }

  if (!sent) {
    return NextResponse.json({
      ok: false,
      error: "No email provider configured (set RESEND_API_KEY or SENDGRID_API_KEY)",
    }, { status: 500 });
  }

  // 6) Optionally update sent_at (keeping a simple history)
  await supabase.from("invites").update({ sent_at: new Date().toISOString() }).eq("id", invite.id);

  // 7) If this was a form post with redirect target, go back there
  if (redirectTo) {
    const back = new URL(redirectTo, baseUrl(request.url));
    return NextResponse.redirect(back);
  }

  return NextResponse.json({ ok: true });
}

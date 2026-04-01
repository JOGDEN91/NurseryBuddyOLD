// Deno Edge Function: send emails (and optional SMS) for auto reminders due today/tomorrow.

import { createClient } from "supabase";

type Row = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string; // timestamptz
  assignee_id: string;
  email: string | null;
  child_snippet: string | null;
};

const TZ = Deno.env.get("TIMEZONE") || "Europe/Dublin";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || ""; // e.g. "Nursery <no-reply@yourdomain>"
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toLocalDate(d = new Date()): Date {
  // Convert "now" to target timezone by using the offset hack
  const now = new Date().toLocaleString("en-GB", { timeZone: TZ });
  return new Date(now);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function alreadySent(reminderId: string, kind: "DUE_TODAY" | "DUE_TOMORROW", channel: "email" | "sms") {
  const { data } = await sb
    .from("app_notification_log")
    .select("id")
    .eq("reminder_id", reminderId)
    .eq("kind", kind)
    .eq("channel", channel)
    .maybeSingle();
  return Boolean(data?.id);
}

async function markSent(reminderId: string, kind: "DUE_TODAY" | "DUE_TOMORROW", channel: "email" | "sms", detail: Record<string, unknown>) {
  await sb.from("app_notification_log").insert({
    reminder_id: reminderId,
    kind,
    channel,
    detail
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) throw new Error("Missing RESEND_API_KEY or FROM_EMAIL");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html
    })
  });
  const body = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(body?.message || "Resend error");
  return body;
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) throw new Error("Missing Twilio env");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ From: TWILIO_FROM, To: to, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const json = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(json?.message || "Twilio error");
  return json;
}

Deno.serve(async () => {
  try {
    const nowLocal = toLocalDate();
    const today = ymd(nowLocal);
    const tomorrow = ymd(new Date(nowLocal.getTime() + 24 * 60 * 60 * 1000));

    // Grab auto reminders due today or tomorrow, with assignee email.
    // We join to auth.users via RPC: get emails through auth schema with service role.
    const { data: reminders, error } = await sb.rpc("rpc_reminders_due_with_email", {
      p_today: today,
      p_tomorrow: tomorrow
    });
    if (error) throw error;

    for (const r of (reminders as Row[])) {
      const dueDate = r.due_at.slice(0,10);
      const kind = dueDate === today ? "DUE_TODAY" : "DUE_TOMORROW";
      if (!r.email) continue;

      // EMAIL (idempotent)
      if (!(await alreadySent(r.id, kind, "email"))) {
        const subject = dueDate === today
          ? "Your council code expires today"
          : "Upcoming: your council code expires soon";

        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
            <h2>${subject}</h2>
            <p>${r.title}</p>
            ${r.child_snippet ? `<p><strong>${r.child_snippet}</strong></p>` : ""}
            <p>Due: <strong>${new Date(r.due_at).toLocaleString("en-GB",{ timeZone: TZ })}</strong></p>
            <p style="color:#555">This is an automated reminder from Nursery Funding App.</p>
          </div>
        `;
        const result = await sendEmail(r.email, subject, html);
        await markSent(r.id, kind, "email", { provider: "resend", result });
      }

      // SMS (optional) — if you store numbers & env vars are set, you can send here.
      // Example: pull phone number from your profile table and call sendSms().
      // (Skipping by default to avoid failures without Twilio config.)
    }

    return new Response(JSON.stringify({ ok: true, count: (reminders as Row[]).length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
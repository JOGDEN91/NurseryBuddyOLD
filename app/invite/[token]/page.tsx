// app/invite/[token]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { createServerActionClient, createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { redirect } from "next/navigation";
import React from "react";

/** Decide where to send the user after redeeming the invite */
async function decideLanding(supabase: ReturnType<typeof createServerActionClient>, userId: string) {
  // Look for any org/nursery-scoped grant and route accordingly.
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role,scope")
    .eq("user_id", userId)
    .limit(10);

  // You can tune this mapping to your real routes later.
  const hasNursery = grants?.some(g => g.scope === "NURSERY");
  const hasOrg     = grants?.some(g => g.scope === "ORG");
  if (hasNursery) return "/staff/overview";
  if (hasOrg)     return "/org/overview";

  // Fallback
  return "/account/profile";
}

/* ---------- Server Action: redeem ---------- */
async function redeemAction(_prev: any, formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });

  const token = String(formData.get("token") || "");
  if (!token) return { ok: false, error: "Missing token" };

  // Must be signed-in as the invited email; function enforces this.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You need to sign in first." };
  }

  const { error } = await supabase.rpc("redeem_invite", { _token: token });
  if (error) {
    return { ok: false, error: error.message };
  }

  const dest = await decideLanding(supabase, user.id);
  redirect(dest);
}

/* ---------- Page ---------- */
export default async function InviteAcceptPage({ params }: { params: { token: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  const token = params.token;

  // Not signed in → ask to sign in (preserve redirect back to this invite)
  if (!user) {
    const signInUrl = `/auth/sign-in?redirect=${encodeURIComponent(`/invite/${token}`)}`;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-md space-y-4 p-6 rounded-2xl shadow bg-white">
          <h1 className="text-xl font-semibold">Accept your invite</h1>
          <p className="text-sm text-gray-600">
            Please sign in using the same email address that received this invite.
          </p>
          <a className="inline-block rounded-xl px-4 py-2 bg-black text-white" href={signInUrl}>
            Sign in to continue
          </a>
          <p className="text-xs text-gray-400">You’ll be sent back here automatically after signing in.</p>
        </div>
      </div>
    );
  }

  // Signed in → show a single-click “Accept” button (server action redeems & redirects)
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form action={redeemAction} className="w-full max-w-md space-y-4 p-6 rounded-2xl shadow bg-white">
        <h1 className="text-xl font-semibold">Accept invite</h1>
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-gray-600">
          You’re signed in as <strong>{user.email}</strong>. Click accept to add the new permissions to your account.
        </p>
        <button className="w-full rounded-xl p-3 bg-black text-white">Accept invite</button>
        <p className="text-xs text-gray-400">
          If the invite was sent to a different email address, sign out and sign in with that email.
        </p>
      </form>
    </div>
  );
}

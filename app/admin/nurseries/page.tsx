// app/admin/nurseries/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/admin";
import {
  createServerComponentClient,
  createServerActionClient,
} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import React from "react";
import { redirect } from "next/navigation";
import NurseryFilters, { NurseryRow } from "./NurseryFilters";

/* server action: add nursery */
async function addNurseryAction(formData: FormData) {
  "use server";
  const supabase = createServerActionClient({ cookies });
  const name = String(formData.get("name") || "").trim();
  const orgId = String(formData.get("org_id") || "");
  const county = String(formData.get("county") || "") || null;
  const country = String(formData.get("country") || "") || null;
  const contact_phone = String(formData.get("contact_phone") || "") || null;

  if (!name || !orgId) return;

  // Prefer your admin_create_nursery RPC if present:
  const { error: rpcErr } = await supabase.rpc("admin_create_nursery", {
    _org_id: orgId,
    _name: name,
  });

  if (rpcErr) {
    // Fallback direct insert if you prefer:
    await supabase.from("nurseries").insert({
      name,
      organisation_id: orgId,
      county,
      country,
      contact_phone,
    });
  } else {
    // Optionally update extra fields after RPC
    await supabase
      .from("nurseries")
      .update({ county, country, contact_phone })
      .eq("name", name)
      .eq("organisation_id", orgId);
  }

  redirect("/admin/nurseries?flash=Nursery%20added");
}

/* server loader */
async function loadData() {
  const { supabase } = await requireAdmin();

  const [{ data: list }, { data: orgs }] = await Promise.all([
    supabase.rpc("admin_list_nurseries", {
      _q: null,
      _county: null,
      _org: null,
    }),
    supabase.from("organisations").select("id,name").order("name", {
      ascending: true,
    }),
  ]);

  return {
    nurseries: (list ?? []) as NurseryRow[],
    organisations: orgs ?? [],
  };
}

export default async function AdminNurseriesPage({
  searchParams,
}: {
  searchParams: { flash?: string };
}) {
  const { nurseries, organisations } = await loadData();
  const counties = Array.from(
    new Set(nurseries.map((n) => n.county).filter(Boolean))
  ).sort() as string[];
  const flash = searchParams?.flash;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {flash && (
        <div
          style={{
            padding: 12,
            border: "1px solid #DDEEDB",
            background: "#F5FFF3",
            borderRadius: 8,
            color: "#254B2A",
          }}
        >
          {decodeURIComponent(flash)}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Nurseries</h2>
          <p style={{ margin: "6px 0 0 0", color: "#666" }}>
            Manage nursery profiles, access, and billing status at-a-glance.
          </p>
        </div>

        {/* Add nursery inline */}
        <form
          action={addNurseryAction}
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            name="name"
            placeholder="New nursery name"
            className="border rounded p-2"
            required
          />
          <select
            name="org_id"
            className="border rounded p-2"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select organisation
            </option>
            {organisations.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            name="county"
            placeholder="County (opt.)"
            className="border rounded p-2"
          />
          <input
            name="country"
            placeholder="Country (opt.)"
            className="border rounded p-2"
          />
          <input
            name="contact_phone"
            placeholder="Phone (opt.)"
            className="border rounded p-2"
          />
          <button className="rounded px-3 py-2 border" type="submit">
            + Add Nursery
          </button>
        </form>
      </div>

      {/* Filters + table (client) */}
      <NurseryFilters
        initialNurseries={nurseries}
        organisations={organisations}
        counties={counties}
      />
    </div>
  );
}

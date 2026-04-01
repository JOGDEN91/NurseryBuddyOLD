// app/org/dashboard/page.tsx
import RequireOrgAdmin from "../(guards)/RequireOrgAdmin";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getWhoAmI, firstOrgIdFor } from "@/lib/authz";

export default async function OrgDashboard() {
  const { grants } = await getWhoAmI();
  const orgId = firstOrgIdFor(grants, "ORG_ADMIN");

  const supabase = getServerSupabase();

  // Basic org row
  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, created_at")
    .eq("id", orgId)
    .maybeSingle();

  // Nurseries under this org (for quick KPIs + table)
  const { data: nurseries } = await supabase
    .from("nurseries")
    .select("id, name, status, organisation_id, created_at")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false });

  // Simple counts (you can replace with a view later)
  const nurseryCount = nurseries?.length ?? 0;

  return (
    <RequireOrgAdmin>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{org?.name ?? "Organisation"} — Overview</h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPI label="Nurseries" value={nurseryCount} />
          <KPI label="Created" value={org?.created_at ? new Date(org.created_at).toLocaleDateString() : "—"} />
          <KPI label="Org ID" value={<span className="font-mono">{org?.id ?? "—"}</span>} />
        </div>

        <section>
          <h2 className="text-lg font-medium mb-2">Nurseries</h2>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(nurseries ?? []).map(n => (
                  <tr key={n.id} className="border-t">
                    <td className="p-3">{n.name}</td>
                    <td className="p-3">{n.status ?? "—"}</td>
                    <td className="p-3">{n.created_at ? new Date(n.created_at).toLocaleDateString() : "—"}</td>
                    <td className="p-3">
                      <a className="underline" href={`/staff/dashboard?nursery_id=${n.id}`}>Open nursery view</a>
                    </td>
                  </tr>
                ))}
                {(!nurseries || nurseries.length === 0) && (
                  <tr><td className="p-3 text-gray-500" colSpan={4}>No nurseries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RequireOrgAdmin>
  );
}

function KPI({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

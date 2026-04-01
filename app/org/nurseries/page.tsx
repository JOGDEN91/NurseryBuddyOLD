// app/org/nurseries/page.tsx
import RequireOrgAdmin from "../(guards)/RequireOrgAdmin";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getWhoAmI, firstOrgIdFor } from "@/lib/authz";

export default async function OrgNurseries() {
  const { grants } = await getWhoAmI();
  const orgId = firstOrgIdFor(grants, "ORG_ADMIN");

  const supabase = getServerSupabase();
  const { data: nurseries, error } = await supabase
    .from("nurseries")
    .select("id, name, status, organisation_id, created_at, county, country")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <RequireOrgAdmin>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Nurseries</h1>
        {error ? (
          <div className="text-red-600">Failed to load nurseries.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="p-3">County / Country</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {(nurseries ?? []).map(n => (
                  <tr key={n.id} className="border-t">
                    <td className="p-3">{n.name}</td>
                    <td className="p-3">{n.county ?? "—"} / {n.country ?? "—"}</td>
                    <td className="p-3">{n.status ?? "—"}</td>
                    <td className="p-3">{n.created_at ? new Date(n.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {(!nurseries || nurseries.length === 0) && (
                  <tr><td className="p-3 text-gray-500" colSpan={4}>No nurseries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireOrgAdmin>
  );
}

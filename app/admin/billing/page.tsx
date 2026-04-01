// app/admin/billing/page.tsx
import { requireAdmin } from "@/lib/admin";

export default async function AdminBillingPage() {
  const { supabase } = await requireAdmin();

  // Example: show org count to orient future billing work
  const { count: orgCount } = await supabase
    .from("organisations")
    .select("*", { count: "exact", head: true });

  return (
    <div style={{ display:"grid", gap:16 }}>
      <h2 style={{ margin:0 }}>Billing</h2>
      <div style={{ background:"#fff", border:"1px solid #E6E4E0", borderRadius:10, padding:16 }}>
        Plans, invoices, payment method status, per-org subscriptions.
        <div style={{ marginTop:8, fontSize:12, color:"#666" }}>
          Organisations to potentially bill: <strong>{orgCount ?? 0}</strong>
        </div>
      </div>
    </div>
  );
}

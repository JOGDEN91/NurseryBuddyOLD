import React from "react";

async function getData(slug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/public/local-authorities/${slug}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function LALanding({ params }: { params: { slug: string }}) {
  const data = await getData(params.slug);
  if (!data?.la) {
    return <div className="p-6">Local Authority not found.</div>;
  }
  const { la, latest_rates, term_dates, documents } = data;

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{la.name}</h1>
        <p className="text-sm text-gray-500">{la.country}</p>
      </header>

      <section>
        <h2 className="text-lg font-medium mb-2">Latest funding rates</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Entitlement</th>
                <th className="text-left p-2">Effective from</th>
                <th className="text-left p-2">Amount (pence)</th>
                <th className="text-left p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(latest_rates ?? []).map((r: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.entitlement_code} — {r.entitlement_description}</td>
                  <td className="p-2">{r.effective_from}</td>
                  <td className="p-2">{r.amount_pence}</td>
                  <td className="p-2">
                    {r.source_url ? <a className="underline" href={r.source_url} target="_blank">{r.notes || "Source"}</a> : (r.notes || "")}
                  </td>
                </tr>
              ))}
              {(!latest_rates || latest_rates.length === 0) && (
                <tr><td className="p-2 text-gray-500" colSpan={4}>No rates yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Term dates</h2>
        <ul className="text-sm space-y-1">
          {(term_dates ?? []).map((t: any, i: number) => (
            <li key={i}>{t.term_name}: {t.starts_on} → {t.ends_on} {t.academic_year ? `(${t.academic_year})` : ""}</li>
          ))}
          {(!term_dates || term_dates.length === 0) && <li className="text-gray-500">No terms yet.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Documents</h2>
        <ul className="text-sm space-y-1">
          {(documents ?? []).map((d: any, i: number) => (
            <li key={i}>
              <a className="underline" href={d.url} target="_blank">
                {d.title}{d.version ? ` (${d.version})` : ""} — {d.doc_type}
              </a>
              {d.effective_from ? ` • from ${d.effective_from}` : ""}
              {d.notes ? ` • ${d.notes}` : ""}
            </li>
          ))}
          {(!documents || documents.length === 0) && <li className="text-gray-500">No documents yet.</li>}
        </ul>
      </section>
    </div>
  );
}

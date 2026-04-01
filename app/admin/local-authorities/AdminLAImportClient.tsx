"use client";

import * as React from "react";

type Totals = {
  inserted?: number;
  updated?: number;
  upserted?: number;
  skipped?: number;
  errors?: number;
};

function calcTotals(json: any): Totals {
  const t: Totals = { inserted: 0, updated: 0, upserted: 0, skipped: 0, errors: 0 };
  const s = json?.summary || {};

  // local_authorities: inserted + updated
  if (s.local_authorities) {
    t.inserted! += Number(s.local_authorities.inserted || 0);
    t.updated!  += Number(s.local_authorities.updated  || 0);
    t.skipped!  += Number(s.local_authorities.skipped  || 0);
    t.errors!   += Number((s.local_authorities.errors || []).length);
  }

  // la_rates / la_term_dates / la_documents: upserted
  for (const key of ["la_rates", "la_term_dates", "la_documents"] as const) {
    if (s[key]) {
      t.upserted! += Number(s[key].upserted || 0);
      t.skipped!  += Number(s[key].skipped  || 0);
      t.errors!   += Number((s[key].errors  || []).length);
    }
  }

  // If API also returns a top-level totals, prefer merging it
  if (json?.totals) {
    const u = json.totals as Totals;
    for (const k of ["inserted","updated","upserted","skipped","errors"] as const) {
      if (typeof u[k] === "number") (t as any)[k] = u[k];
    }
  }

  return t;
}

export default function AdminLAImportClient({
  refresh,
}: {
  refresh?: () => void;
}) {
  const [dataset, setDataset] = React.useState<"local_authorities" | "la_rates" | "la_term_dates" | "la_documents">("local_authorities");
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [banner, setBanner] = React.useState<{ kind: "idle" | "ok" | "err"; text: string }>({ kind: "idle", text: "" });

  async function onImport() {
    if (!file) {
      setBanner({ kind: "err", text: "Choose a CSV file first." });
      return;
    }
    setLoading(true);
    setBanner({ kind: "idle", text: "" });

    try {
      const fd = new FormData();
      // Your API now auto-detects, but we still give a strong hint:
      fd.append("dataset", dataset);
      // The route accepts generic names like "file", so this is fine:
      fd.append("file", file, file.name);

      const res = await fetch("/api/admin/local-authorities/import", {
        method: "POST",
        body: fd,
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();
      const totals = calcTotals(json);
      const imported =
        Number(totals.upserted || 0) +
        Number(totals.inserted || 0) +
        Number(totals.updated || 0);

      if (!res.ok) {
        setBanner({
          kind: "err",
          text: `Import failed (${res.status}). Imported: ${imported}, Skipped: ${totals.skipped}, Errors: ${totals.errors}`,
        });
      } else {
        setBanner({
          kind: "ok",
          text: `Imported/Upserted: ${imported}  •  Inserted: ${totals.inserted}  •  Updated: ${totals.updated}  •  Skipped: ${totals.skipped}  •  Errors: ${totals.errors}`,
        });
        // optional refresh of the table beside the widget
        refresh?.();
      }
    } catch (e: any) {
      setBanner({ kind: "err", text: e?.message || "Import failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          className="border rounded px-2 py-1"
          value={dataset}
          onChange={(e) => setDataset(e.target.value as any)}
        >
          <option value="local_authorities">Local Authorities</option>
          <option value="la_rates">LA Rates</option>
          <option value="la_term_dates">LA Term Dates</option>
          <option value="la_documents">LA Documents</option>
        </select>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <button
          onClick={onImport}
          disabled={loading || !file}
          className={`px-3 py-1 rounded text-white ${loading ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {loading ? "Importing…" : "Import"}
        </button>

        <button
          type="button"
          onClick={() => refresh?.()}
          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
        >
          Refresh table
        </button>
      </div>

      {banner.kind !== "idle" && (
        <div
          className={`text-sm px-3 py-2 rounded ${
            banner.kind === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Templates:&nbsp;
        <a className="underline" href="/admin/local-authorities/templates/local_authorities_seed.csv">local_authorities_seed.csv</a>{" · "}
        <a className="underline" href="/admin/local-authorities/templates/la_rates_seed.csv">la_rates_seed.csv</a>{" · "}
        <a className="underline" href="/admin/local-authorities/templates/la_term_dates_seed.csv">la_term_dates_seed.csv</a>{" · "}
        <a className="underline" href="/admin/local-authorities/templates/la_sources_seed.csv">la_sources_seed.csv</a>
      </div>
    </div>
  );
}

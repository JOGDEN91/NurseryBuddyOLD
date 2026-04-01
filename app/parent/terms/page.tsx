"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ChildItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nursery?: {
    id: string;
    name?: string | null;
    la_id?: string | null;
    la_name?: string | null;
  } | null;
};

type ProfileResponse = {
  ok: boolean;
  children?: ChildItem[];
  error?: string;
};

type TermRow = {
  id: string;
  term_name: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

type TermApiResponse = {
  ok: boolean;
  items?: TermRow[];
  error?: string;
};

export default function ParentTermsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [laId, setLaId] = useState<string | null>(null);
  const [laName, setLaName] = useState<string | null>(null);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => router.push("/parent");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Get children + nursery / LA info
        const res = await fetch("/api/parent/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        let data: ProfileResponse = { ok: false };
        try {
          data = text ? JSON.parse(text) : { ok: false };
        } catch {
          data = { ok: false, error: "Invalid response" };
        }

        if (!res.ok || data.ok === false) {
          if (!cancelled)
            setError(data.error || `Failed to load profile (${res.status})`);
          return;
        }

        const children = data.children || [];
        // Find first child with a nursery + LA
        const withNursery = children.find(
          (c) => c.nursery && c.nursery.la_id
        );

        if (!withNursery || !withNursery.nursery?.la_id) {
          if (!cancelled)
            setError(
              "We could not find a linked Local Authority for your nursery yet."
            );
          return;
        }

        const laIdVal = withNursery.nursery.la_id;
        const laNameVal =
          withNursery.nursery.la_name || "your local authority";

        if (cancelled) return;

        setLaId(laIdVal);
        setLaName(laNameVal);

        // 2) Fetch term dates for that LA
        const tRes = await fetch(`/api/la/${laIdVal}/term-dates`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const tJson: TermApiResponse = await tRes
          .json()
          .catch(() => ({ ok: false, error: "Invalid term-dates response" }));

        if (!tRes.ok || tJson.ok === false) {
          if (!cancelled)
            setError(
              tJson.error || `Failed to load term dates (${tRes.status})`
            );
          return;
        }

        if (!cancelled) {
          setTerms(tJson.items || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Unexpected error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {/* Blue background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ backgroundColor: "#24364B" }}
      />

      <FixedBackHeader onBack={goBack} />

      <div className="relative z-10 min-h-screen">
        <div className="h-10" />

        <div className="mx-auto max-w-screen-sm px-4 pb-24 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm">
            <h1 className="text-lg font-semibold">Term dates</h1>
            <p className="mt-1 text-xs text-gray-500">
              These are the term dates published by{" "}
              <span className="font-medium">
                {laName || "your local authority"}
              </span>
              . Exact start and end dates may vary slightly by school or
              provider.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
              Loading term dates…
            </div>
          ) : !terms.length && !error ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
              No term dates have been added yet for your local authority.
            </div>
          ) : null}

          {terms.length > 0 && !error && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
              <div className="text-sm font-semibold mb-2">
                Upcoming and recent terms
              </div>
              <div className="divide-y">
                {terms.map((t) => (
                  <div key={t.id} className="py-2 text-sm">
                    <div className="font-medium">{t.term_name}</div>
                    <div className="text-xs text-gray-500">
                      {t.academic_year
                        ? `${t.academic_year} • `
                        : null}
                      {t.start_date || "?"} – {t.end_date || "?"}
                    </div>
                    {t.notes && (
                      <div className="mt-1 text-xs text-gray-600">
                        {t.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Fixed header: same pattern as other parent detail pages */
function FixedBackHeader({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50"
      style={{ backgroundColor: "#24364B" }}
    >
      <div className="mx-auto flex h-12 max-w-screen-sm items-center justify-between px-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 -ml-1 items-center justify-center text-2xl leading-none text-white focus:outline-none"
        >
          ‹
        </button>
        <div className="pointer-events-none absolute left-0 right-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nursery-buddy-icon.png" alt="Logo" className="h-8" />
        </div>
        <div className="w-10" />
      </div>
    </div>
  );
}
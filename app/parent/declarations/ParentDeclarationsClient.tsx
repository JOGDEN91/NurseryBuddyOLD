"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DeclarationSummary = {
  id: string;
  status: string;
  created_at: string | null;
  child: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  };
  term: {
    id: string;
    label: string;
    start_date: string | null;
    end_date: string | null;
  };
};

type Payload = {
  ok: boolean;
  items?: DeclarationSummary[];
  error?: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export default function ParentDeclarationsClient() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/parent/profile");
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/parent/declarations", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j: Payload = await res.json();
        if (cancel) return;
        if (!res.ok || j.ok === false) {
          setError(j.error || `HTTP ${res.status}`);
        } else {
          setData(j);
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Network error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const items = data?.items ?? [];

  return (
    <>
      {/* Background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ backgroundColor: "#24364B" }}
      />

      <FixedBackHeader onBack={goBack} />

      <div className="relative z-10 min-h-screen">
        <div className="h-10" />

        <div className="mx-auto max-w-screen-sm px-4 pb-24 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            <h1 className="text-lg font-semibold">Declarations</h1>
            <p className="mt-1 text-xs text-gray-500">
              Review and sign your funding declarations for each child and term.
            </p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm text-sm">
              You don&apos;t have any declarations to sign at the moment.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((d) => {
                const childName =
                  `${d.child.first_name ?? ""} ${d.child.last_name ?? ""}`.trim() ||
                  "Unnamed child";
                const statusLabel =
                  d.status === "signed"
                    ? "Signed"
                    : d.status === "superseded"
                    ? "Superseded"
                    : "Pending";
                const statusColour =
                  d.status === "signed"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : d.status === "superseded"
                    ? "bg-gray-50 text-gray-700 border-gray-200"
                    : "bg-amber-50 text-amber-800 border-amber-200";

                return (
                  <Link
                    key={d.id}
                    href={`/parent/declarations/${d.id}`}
                    className="block rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-gray-500">{d.term.label || "Term"}</div>
                        <div className="text-sm font-semibold">{childName}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {fmtDate(d.term.start_date)} – {fmtDate(d.term.end_date)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColour}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="text-[11px] text-gray-400">Tap to view</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

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
          <img src="/nursery-buddy-icon.png" alt="Logo" className="h-9" />
        </div>
        <div className="w-10" />
      </div>
    </div>
  );
}
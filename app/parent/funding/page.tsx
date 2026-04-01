// app/parent/funding/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChildFundingCard } from "../children/[id]/ChildFundingCard";

type ChildListItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url?: string | null;
  nursery_id?: string | null;
};

type ProfileResponse = {
  ok: boolean;
  parent?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    ni_number?: string | null;
  } | null;
  children?: ChildListItem[];
  error?: string;
};

export default function ParentFundingPage() {
  const router = useRouter();

  const [children, setChildren] = useState<ChildListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const goBack = () => {
    router.push("/parent");
  };

  // Load children via /api/parent/profile (same as profile/documents/invoices)
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
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

        if (cancel) return;

        if (!res.ok || data.ok === false) {
          setError(data.error || `HTTP ${res.status}`);
          setChildren([]);
        } else {
          const list = data.children || [];
          setChildren(list);
          if (list.length && !selectedId) {
            setSelectedId(list[0].id);
          }
        }
      } catch (e: any) {
        if (!cancel) {
          setError(e?.message || "Network error");
          setChildren([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedChild = children.find((c) => c.id === selectedId) || null;
  const selectedName =
    (selectedChild &&
      `${selectedChild.first_name ?? ""} ${selectedChild.last_name ?? ""}`.trim()) ||
    "";

  return (
    <>
      {/* Solid blue background behind everything */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ backgroundColor: "#24364B" }}
      />

      <FixedBackHeader onBack={goBack} />

      <div className="relative z-10 min-h-screen">
        {/* Spacer under fixed header */}
        <div className="h-10" />

        <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 pb-24 pt-1">
          {/* Intro card */}
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900 shadow-sm">
            <h1 className="text-lg font-semibold">Funding & entitlements</h1>
            <p className="mt-1 text-xs text-gray-500">
              Choose a child to see which funded hours they receive now, why they
              qualify, and what they may be eligible for in future terms.
            </p>
          </div>

          {/* Error card */}
          {error && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          {/* Children list card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">My children</h2>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
              </div>
            ) : children.length === 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No linked children yet. If your nursery recently invited you, try
                refreshing in a moment.
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {children.map((c) => {
                  const fullName =
                    `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                    "Unnamed";
                  const isSelected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                          "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white",
                          isSelected
                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                            : "border-gray-200 bg-white hover:shadow-sm",
                        ].join(" ")}
                      >
                        <div className="h-16 w-16 overflow-hidden rounded-md border">
                          {c.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.photo_url}
                              alt={fullName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-xs text-gray-400">
                              No photo
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {fullName}
                          </div>
                          {isSelected && (
                            <div className="mt-0.5 text-[11px] text-indigo-700">
                              Viewing funding summary
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Child funding panel */}
          {selectedChild ? (
            <ChildFundingCard
              childId={selectedChild.id}
              childName={selectedName || "Unnamed"}
            />
          ) : (
            !loading &&
            !error && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                Select a child above to view their funding entitlements.
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

/** Fixed header: exact #24364B background + centered logo + left back glyph */
function FixedBackHeader({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50"
      style={{ backgroundColor: "#24364B" }}
    >
      <div className="mx-auto flex h-12 max-w-screen-sm items-center justify-between px-3">
        {/* Left: back glyph */}
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 -ml-1 items-center justify-center text-2xl leading-none text-white focus:outline-none"
        >
          ‹
        </button>

        {/* Center: logo from /public */}
        <div className="pointer-events-none absolute left-0 right-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nursery-buddy-icon.png" alt="Logo" className="h-9" />
        </div>

        {/* Right spacer to balance layout */}
        <div className="w-10" />
      </div>
    </div>
  );
}

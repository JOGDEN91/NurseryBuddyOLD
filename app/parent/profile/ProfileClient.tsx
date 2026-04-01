"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Child = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url?: string | null;
  nursery_id?: string | null;
};

type ParentPayload = {
  full_name?: string | null;
  ni_number?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Payload = {
  ok: boolean;
  parent?: ParentPayload;
  children?: Child[];
};

export default function ProfileClient() {
  const router = useRouter();

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Household / second parent state
  const [householdLoading, setHouseholdLoading] = useState(true);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const [householdSaving, setHouseholdSaving] = useState(false);

  const [singleParent, setSingleParent] = useState(false);
  const [parent2Name, setParent2Name] = useState("");
  const [parent2Dob, setParent2Dob] = useState("");
  const [parent2Email, setParent2Email] = useState("");
  const [parent2Nis, setParent2Nis] = useState("");

  const [hasNurseryConnection, setHasNurseryConnection] = useState(false);

  // Profile change-request editing state (Primary Parent / Carer)
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDob, setProfileDob] = useState(""); // not persisted yet
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileNi, setProfileNi] = useState("");

  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  // Second parent change-request editing state
  const [editingSecondParent, setEditingSecondParent] = useState(false);
  const [secondRequestSubmitting, setSecondRequestSubmitting] = useState(false);
  const [secondRequestError, setSecondRequestError] = useState<string | null>(null);
  const [secondRequestSuccess, setSecondRequestSuccess] = useState<string | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/parent");
    }
  };

  // Load profile + children list
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
        let j: any = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch {
          j = { ok: false, error: "Invalid response" };
        }
        if (!cancel) {
          if (!res.ok || j?.ok === false) setError(j?.error || `HTTP ${res.status}`);
          else setData(j as Payload);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancel) {
          setError(e?.message || "Network error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Initialise profile draft fields from parent payload
  useEffect(() => {
    const p = data?.parent;
    if (!p) return;
    setProfileName(p.full_name || "");
    setProfileEmail(p.email || "");
    setProfilePhone(p.phone || "");
    setProfileNi(p.ni_number || "");
    // profileDob left as "", as DOB is not yet stored
  }, [data?.parent]);

  // Load household-level second parent + single-parent
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/parent/household", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        let j: any = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch {
          j = { ok: false, error: "Invalid response" };
        }
        if (!cancel) {
          if (!res.ok || j?.ok === false) {
            setHouseholdError(j?.error || `HTTP ${res.status}`);
          } else {
            setSingleParent(!!j.single_parent);
            setParent2Name(j.parent2_name || "");
            setParent2Dob(j.parent2_dob || "");
            setParent2Email(j.parent2_email || "");
            setParent2Nis(j.parent2_nis || "");
            setHasNurseryConnection(!!j.has_nursery_connection);
          }
          setHouseholdLoading(false);
        }
      } catch (e: any) {
        if (!cancel) {
          setHouseholdError(e?.message || "Network error");
          setHouseholdLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Save second parent + single-parent directly (only when no nursery connection)
  const handleSaveSecondParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setHouseholdError(null);

    if (hasNurseryConnection) {
      setHouseholdError(
        "Your nursery is linked to at least one child. Please use the 'Request changes' button above to update parent / carer details."
      );
      return;
    }

    setHouseholdSaving(true);
    try {
      const res = await fetch("/api/parent/household", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          single_parent: singleParent,
          parent2_name: parent2Name,
          parent2_email: parent2Email,
          parent2_nis: parent2Nis,
          parent2_dob: parent2Dob,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || (json as any)?.ok === false) {
        setHouseholdError(
          (json as any)?.error || `Unable to save second parent details (HTTP ${res.status}).`
        );
      }
    } catch (err: any) {
      setHouseholdError(err?.message || "Network error while saving.");
    } finally {
      setHouseholdSaving(false);
    }
  };

  // Submit a change request for My Profile (Primary Parent / Carer)
  async function handleSubmitChangeRequest() {
    setRequestError(null);
    setRequestSuccess(null);

    if (!profileName.trim()) {
      setRequestError("Please provide your name.");
      return;
    }
    if (!profileNi.trim()) {
      setRequestError("Please provide your National Insurance number.");
      return;
    }

    setRequestSubmitting(true);
    try {
      const lines = [
        "Requested parent profile change:",
        `Name: ${profileName || "(no change)"}`,
        `Date of birth: ${profileDob || "(not provided)"}`,
        `Email: ${profileEmail || "(no change)"}`,
        `Phone: ${profilePhone || "(no change)"}`,
        `NI Number: ${profileNi || "(no change)"}`,
      ];
      const message = lines.join("\n");

      const res = await fetch("/api/parent/change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "parent_profile",
          message,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || (json as any)?.ok === false) {
        setRequestError(
          (json as any)?.error || `Unable to submit change request (HTTP ${res.status}).`
        );
      } else {
        setRequestSuccess("Your request has been sent to the nursery.");
        setEditingProfile(false);
      }
    } catch (err: any) {
      setRequestError(err?.message || "Network error while submitting request.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  // Submit a change request for Second Parent / Carer + single-parent flag
  async function handleSubmitSecondParentRequest() {
    setSecondRequestError(null);
    setSecondRequestSuccess(null);

    // We can be fairly light on validation here; nursery will see the whole payload
    const lines = [
      "Requested second parent / carer change:",
      `Single parent household: ${singleParent ? "Yes" : "No"}`,
      `Second parent name: ${parent2Name || "(none)"}`,
      `Second parent date of birth: ${parent2Dob || "(none)"}`,
      `Second parent email: ${parent2Email || "(none)"}`,
      `Second parent NI number: ${parent2Nis || "(none)"}`,
    ];
    const message = lines.join("\n");

    setSecondRequestSubmitting(true);
    try {
      const res = await fetch("/api/parent/change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "second_parent",
          message,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || (json as any)?.ok === false) {
        setSecondRequestError(
          (json as any)?.error ||
            `Unable to submit second parent change request (HTTP ${res.status}).`
        );
      } else {
        setSecondRequestSuccess("Your request has been sent to the nursery.");
        setEditingSecondParent(false);
      }
    } catch (err: any) {
      setSecondRequestError(
        err?.message || "Network error while submitting second parent change request."
      );
    } finally {
      setSecondRequestSubmitting(false);
    }
  }

  // Loading / error wrappers
  if (loading) {
    return (
      <>
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{ backgroundColor: "#24364B" }}
        />

        <FixedBackHeader onBack={goBack} />

        <div className="relative z-10 min-h-screen">
          <div className="h-10" />

          <div className="mx-auto max-w-screen-sm px-4 pb-24">
            <div className="h-24 w-full animate-pulse rounded-2xl bg-gray-100" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{ backgroundColor: "#24364B" }}
        />

        <FixedBackHeader onBack={goBack} />

        <div className="relative z-10 min-h-screen">
          <div className="h-10" />
          <div className="mx-auto max-w-screen-sm px-4 pb-24">
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              {error}
            </div>
          </div>
        </div>
      </>
    );
  }

  const parent = data?.parent;
  const children = data?.children || [];

  return (
    <>
      {/* Uniform #24364B background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ backgroundColor: "#24364B" }}
      />

      <FixedBackHeader onBack={goBack} />

      {/* Settings cog */}
      <div className="fixed right-3 top-3 z-60">
        <Link
          href="/parent/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded text-2xl leading-none text-white
                     focus:outline-none focus:ring-2 focus:ring-white/70"
          style={{ background: "transparent" }}
        >
          ⚙︎
        </Link>
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen">
        <div className="h-10" />

        <div className="mx-auto max-w-screen-sm px-4 pb-24 space-y-6">
          {/* Parent profile card (Primary Parent / Carer) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold">My Profile</h1>
                <p className="mt-1 text-xs text-gray-500">Primary Parent / Carer</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {/* Name */}
              <div>
                <div className="text-gray-500">Name</div>
                {editingProfile ? (
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                ) : (
                  <div className="font-medium">{parent?.full_name || "—"}</div>
                )}
              </div>

              {/* Date of birth (not yet persisted) */}
              <div>
                <div className="text-gray-500">Date of birth</div>
                {editingProfile ? (
                  <input
                    type="date"
                    value={profileDob}
                    onChange={(e) => setProfileDob(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                ) : (
                  <div className="font-medium">—</div>
                )}
              </div>

              {/* Email */}
              <div>
                <div className="text-gray-500">Email</div>
                {editingProfile ? (
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                ) : (
                  <div className="font-medium">{parent?.email || "—"}</div>
                )}
              </div>

              {/* Phone */}
              <div>
                <div className="text-gray-500">Phone</div>
                {editingProfile ? (
                  <input
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                ) : (
                  <div className="font-medium">{parent?.phone || "—"}</div>
                )}
              </div>

              {/* NI Number */}
              <div>
                <div className="text-gray-500">NI Number</div>
                {editingProfile ? (
                  <input
                    type="text"
                    value={profileNi}
                    onChange={(e) => setProfileNi(e.target.value.toUpperCase())}
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    autoComplete="off"
                  />
                ) : (
                  <div className="font-medium">{parent?.ni_number || "—"}</div>
                )}
              </div>
            </div>

            {/* Change request flow for primary parent when nursery is connected */}
            {hasNurseryConnection && (
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-xs text-gray-500">
                  Your nursery uses these details for funding checks. To update them, please
                  request changes so the nursery can review and approve.
                </p>

                {requestError && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {requestError}
                  </div>
                )}
                {requestSuccess && (
                  <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    {requestSuccess}
                  </div>
                )}

                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                  disabled={requestSubmitting}
                  onClick={async () => {
                    if (!editingProfile) {
                      // Enter editing mode
                      setRequestError(null);
                      setRequestSuccess(null);
                      setProfileName(parent?.full_name || "");
                      setProfileEmail(parent?.email || "");
                      setProfilePhone(parent?.phone || "");
                      setProfileNi(parent?.ni_number || "");
                      setEditingProfile(true);
                    } else {
                      await handleSubmitChangeRequest();
                    }
                  }}
                >
                  {editingProfile
                    ? requestSubmitting
                      ? "Submitting…"
                      : "Submit change request"
                    : "Request changes"}
                </button>
              </div>
            )}
          </div>

          {/* Second Parent / Carer card with single-parent tick box */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Second Parent / Carer</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Add details for an additional parent or carer, or mark this as a single parent /
                  carer household.
                </p>
              </div>
            </div>

            {householdLoading ? (
              <div className="mt-3 text-sm text-gray-500">
                Loading parent / carer details…
              </div>
            ) : (
              <form onSubmit={handleSaveSecondParent} className="mt-4 space-y-4 text-sm">
                {/* Single parent toggle */}
                <div className="flex items-center gap-2">
                  <input
                    id="single-parent"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    checked={singleParent}
                    onChange={(e) => setSingleParent(e.target.checked)}
                    disabled={hasNurseryConnection && !editingSecondParent}
                  />
                  <label htmlFor="single-parent" className="text-sm text-gray-800">
                    Single parent / carer household
                  </label>
                </div>

                {/* Second parent fields */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Name</label>
                    <input
                      type="text"
                      value={parent2Name}
                      onChange={(e) => setParent2Name(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      disabled={(hasNurseryConnection && !editingSecondParent)}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Date of birth</label>
                    <input
                      type="date"
                      value={parent2Dob}
                      onChange={(e) => setParent2Dob(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      disabled={(hasNurseryConnection && !editingSecondParent)}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">Email</label>
                    <input
                      type="email"
                      value={parent2Email}
                      onChange={(e) => setParent2Email(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      disabled={(hasNurseryConnection && !editingSecondParent)}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600">NI Number</label>
                    <input
                      type="text"
                      value={parent2Nis}
                      onChange={(e) => setParent2Nis(e.target.value.toUpperCase())}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      autoComplete="off"
                      disabled={(hasNurseryConnection && !editingSecondParent)}
                    />
                  </div>
                </div>

                {householdError && !hasNurseryConnection && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {householdError}
                  </div>
                )}

                {secondRequestError && hasNurseryConnection && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {secondRequestError}
                  </div>
                )}

                {secondRequestSuccess && hasNurseryConnection && (
                  <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    {secondRequestSuccess}
                  </div>
                )}

                {/* Pre-nursery: direct save; post-nursery: request flow */}
                {!hasNurseryConnection ? (
                  <div className="mt-2">
                    <button
                      type="submit"
                      disabled={householdSaving}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm disabled:opacity-60"
                    >
                      {householdSaving ? "Saving…" : "Save second parent details"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={secondRequestSubmitting}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm disabled:opacity-60"
                      onClick={async () => {
                        if (!editingSecondParent) {
                          // Enter editing mode
                          setSecondRequestError(null);
                          setSecondRequestSuccess(null);
                          setEditingSecondParent(true);
                        } else {
                          await handleSubmitSecondParentRequest();
                        }
                      }}
                    >
                      {editingSecondParent
                        ? secondRequestSubmitting
                          ? "Submitting…"
                          : "Submit change request"
                        : "Request changes"}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Children list card (unchanged) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">My Children</h2>

            {children.length === 0 ? (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                No linked children yet. If your nursery recently invited you, try refreshing in a
                moment.
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {children.map((c) => {
                  const fullName =
                    `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed";
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/parent/children/${c.id}`}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 p-3
                                   no-underline transition hover:shadow-sm
                                   hover:no-underline focus:no-underline active:no-underline"
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
                          <div className="truncate text-base font-semibold">{fullName}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* “+ Child” CTA (full width) */}
          <div>
            <Link
              href="/parent/children/new"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200
                         bg-white text-gray-900 shadow-sm"
            >
              <span className="text-lg leading-none">＋</span>
              <span className="font-medium">Add child</span>
            </Link>
          </div>
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
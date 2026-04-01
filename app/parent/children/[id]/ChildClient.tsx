"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** API payloads */
type Child = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url?: string | null;
  nursery_id?: string | null;
  nursery_name?: string | null;
  organisation_name?: string | null;
  date_of_birth?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  claim_working_parent?: boolean | null;
  claim_disadvantaged2?: boolean | null;
  address_line1?: string | null;
  address_line2?: string | null;
  town?: string | null;
  postcode?: string | null;
  hours_mon?: number | null;
  hours_tue?: number | null;
  hours_wed?: number | null;
  hours_thu?: number | null;
  hours_fri?: number | null;
  gender?: string | null;
  ethnicity?: string | null;
  updated_at?: string | null;
};

type FundingCode = {
  id: string;
  code: string | null;
  issuer: string | null;
  expiry_date: string | null;
  valid_from: string | null;
  status: string | null;
  verified_at: string | null;
};

type Payload = {
  ok: boolean;
  child?: Child | null;
  funding?: FundingCode | null;
};

const LOCALE = "en-GB"; // DD/MM/YYYY

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString(LOCALE, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d ?? "—"
    : dt.toLocaleString(LOCALE, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function fmtHours(n?: number | null) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  return v.toFixed(v % 1 === 0 ? 0 : 1);
}

export default function ChildClient({ childId }: { childId: string }) {
  const router = useRouter();

  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Request/edit state
  const [editingChild, setEditingChild] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  // Proposed values for editable fields
  const [proposedDob, setProposedDob] = useState("");
  const [proposedGender, setProposedGender] = useState("");
  const [proposedEthnicity, setProposedEthnicity] = useState("");
  const [proposedStartDate, setProposedStartDate] = useState("");
  const [proposedEndDate, setProposedEndDate] = useState("");
  const [proposedAddressLine1, setProposedAddressLine1] = useState("");
  const [proposedAddressLine2, setProposedAddressLine2] = useState("");
  const [proposedTown, setProposedTown] = useState("");
  const [proposedPostcode, setProposedPostcode] = useState("");
  const [proposedHoursMon, setProposedHoursMon] = useState("");
  const [proposedHoursTue, setProposedHoursTue] = useState("");
  const [proposedHoursWed, setProposedHoursWed] = useState("");
  const [proposedHoursThu, setProposedHoursThu] = useState("");
  const [proposedHoursFri, setProposedHoursFri] = useState("");
  const [proposedFunding, setProposedFunding] = useState("");

  const child = payload?.child || null;
  const funding = payload?.funding || null;

  const fullName = useMemo(
    () => `${child?.first_name ?? ""} ${child?.last_name ?? ""}`.trim() || "Unnamed",
    [child?.first_name, child?.last_name]
  );

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/parent/profile");
    }
  };

  async function refresh() {
    const res = await fetch(`/api/parent/children/${childId}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const j = await res.json();
    if (!res.ok || j?.ok === false) {
      throw new Error(j?.error || `HTTP ${res.status}`);
    }
    setPayload(j as Payload);
  }

  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        const res = await fetch(`/api/parent/children/${childId}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        const j = text ? JSON.parse(text) : {};
        if (!cancel) {
          if (!res.ok || j?.ok === false) {
            setError(j?.error || `HTTP ${res.status}`);
          } else {
            setPayload(j as Payload);
          }
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Network error");
      }
    })();

    return () => {
      cancel = true;
    };
  }, [childId]);

  // When the child loads, initialise proposed fields
  useEffect(() => {
    if (!child) return;
    setProposedDob(child.date_of_birth || "");
    setProposedGender(child.gender || "");
    setProposedEthnicity(child.ethnicity || "");
    setProposedStartDate(child.start_date || "");
    setProposedEndDate(child.end_date || "");
    setProposedAddressLine1(child.address_line1 || "");
    setProposedAddressLine2(child.address_line2 || "");
    setProposedTown(child.town || "");
    setProposedPostcode(child.postcode || "");
    setProposedHoursMon(
      child.hours_mon === null || child.hours_mon === undefined ? "" : String(child.hours_mon)
    );
    setProposedHoursTue(
      child.hours_tue === null || child.hours_tue === undefined ? "" : String(child.hours_tue)
    );
    setProposedHoursWed(
      child.hours_wed === null || child.hours_wed === undefined ? "" : String(child.hours_wed)
    );
    setProposedHoursThu(
      child.hours_thu === null || child.hours_thu === undefined ? "" : String(child.hours_thu)
    );
    setProposedHoursFri(
      child.hours_fri === null || child.hours_fri === undefined ? "" : String(child.hours_fri)
    );
  }, [child]);

  async function saveFundingCode(nextCode: string, nextExpiry?: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/children/${childId}/funding-code`, {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: nextCode, expiry_date: nextExpiry || null }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/children/${childId}/photo`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        body: form,
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/children/${childId}/photo`, {
        method: "DELETE",
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to remove");
    } finally {
      setUploading(false);
    }
  }

  async function submitChildChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);
    setRequestSuccess(null);

    if (!child) return;

    // First click: enter edit mode, don't send anything yet
    if (!editingChild) {
      setEditingChild(true);
      // sync from latest child values
      setProposedDob(child.date_of_birth || "");
      setProposedGender(child.gender || "");
      setProposedEthnicity(child.ethnicity || "");
      setProposedStartDate(child.start_date || "");
      setProposedEndDate(child.end_date || "");
      setProposedAddressLine1(child.address_line1 || "");
      setProposedAddressLine2(child.address_line2 || "");
      setProposedTown(child.town || "");
      setProposedPostcode(child.postcode || "");
      setProposedHoursMon(
        child.hours_mon === null || child.hours_mon === undefined ? "" : String(child.hours_mon)
      );
      setProposedHoursTue(
        child.hours_tue === null || child.hours_tue === undefined ? "" : String(child.hours_tue)
      );
      setProposedHoursWed(
        child.hours_wed === null || child.hours_wed === undefined ? "" : String(child.hours_wed)
      );
      setProposedHoursThu(
        child.hours_thu === null || child.hours_thu === undefined ? "" : String(child.hours_thu)
      );
      setProposedHoursFri(
        child.hours_fri === null || child.hours_fri === undefined ? "" : String(child.hours_fri)
      );
      return;
    }

    // Already editing: now submit
    if (!requestMessage.trim()) {
      setRequestError(
        "Please use the notes box to describe what you would like the nursery to change."
      );
      return;
    }

    setRequestSubmitting(true);
    try {
      const orgNursery =
        (child.organisation_name ? `${child.organisation_name}` : "") +
        (child.organisation_name && child.nursery_name ? " - " : "") +
        (child.nursery_name || "");

      const lines = [
        `Requested change for child: ${fullName} (${child.id})`,
        orgNursery ? `Nursery: ${orgNursery}` : "Nursery: (not linked)",
        "",
        "Requested changes (notes):",
        requestMessage.trim(),
      ];
      const message = lines.join("\n");

      const proposed: Record<string, any> = {};

      if (proposedDob) proposed.date_of_birth = proposedDob;
      if (proposedGender) proposed.gender = proposedGender;
      if (proposedEthnicity) proposed.ethnicity = proposedEthnicity;
      if (proposedStartDate) proposed.start_date = proposedStartDate;
      if (proposedEndDate) proposed.end_date = proposedEndDate;
      if (proposedAddressLine1) proposed.address_line1 = proposedAddressLine1;
      if (proposedAddressLine2) proposed.address_line2 = proposedAddressLine2;
      if (proposedTown) proposed.town = proposedTown;
      if (proposedPostcode) proposed.postcode = proposedPostcode;

      const hours = {
        mon: proposedHoursMon,
        tue: proposedHoursTue,
        wed: proposedHoursWed,
        thu: proposedHoursThu,
        fri: proposedHoursFri,
      };

      for (const [key, value] of Object.entries(hours)) {
        const trimmed = value.trim();
        if (!trimmed) continue;
        const num = Number(trimmed);
        if (!isNaN(num)) {
          proposed[`hours_${key}`] = num;
        }
      }

      if (proposedFunding) {
        proposed.funding_entitlements = proposedFunding;
      }

      proposed.notes = requestMessage.trim();

      const res = await fetch("/api/parent/change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "child_profile",
          message,
          payload: {
            child_id: child.id,
            proposed,
          },
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || (json as any)?.ok === false) {
        setRequestError(
          (json as any)?.error ||
            `Unable to submit change request (HTTP ${res.status}).`
        );
      } else {
        setRequestSuccess("Your request has been sent to the nursery.");
        setEditingChild(false);
      }
    } catch (err: any) {
      setRequestError(err?.message || "Network error while submitting request.");
    } finally {
      setRequestSubmitting(false);
    }
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
          <div className="px-4 pb-24">
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              {error}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!child) {
    return (
      <>
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{ backgroundColor: "#24364B" }}
        />

        <FixedBackHeader onBack={goBack} />
        <div className="relative z-10 min-h-screen">
          <div className="h-10" />
          <div className="px-4 pb-24">
            <div className="animate-pulse h-24 rounded-xl bg-gray-100" />
          </div>
        </div>
      </>
    );
  }

  const orgNursery =
    (child.organisation_name ? `${child.organisation_name}` : "") +
    (child.organisation_name && child.nursery_name ? " - " : "") +
    (child.nursery_name || "");
  const requiresCode = !!child.claim_working_parent;
  const lastUpdated = child.updated_at;

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
          <div className="mt-0 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
            {/* Header: photo + basic info */}
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group absolute inset-0 z-10 grid place-items-center bg-black/0 transition hover:bg-black/30"
                  title={child.photo_url ? "Change photo" : "Upload photo"}
                >
                  <span className="pointer-events-none hidden text-xs font-medium text-white group-hover:block">
                    {uploading ? "Uploading…" : child.photo_url ? "Change" : "Upload"}
                  </span>
                </button>
                {child.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={child.photo_url}
                    alt={fullName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-gray-400">
                    No photo
                  </div>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const input = e.currentTarget as HTMLInputElement;
                  const f = input.files?.[0];
                  if (!f) return;

                  input.value = "";
                  try {
                    await uploadPhoto(f);
                  } catch {
                    // handled in uploadPhoto
                  }
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">{fullName}</div>
                <div className="text-xs text-gray-500">{orgNursery || "—"}</div>
                {child.photo_url ? (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="mt-1 text-xs text-red-600 hover:underline"
                    disabled={uploading}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>

            {/* Details + Request edits form */}
            <form onSubmit={submitChildChangeRequest} className="mt-4 space-y-4">
              {/* Meta: DOB, gender, ethnicity, address, start/end – read-only vs editable */}
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {/* DOB */}
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs">Date of birth</span>
                  {editingChild ? (
                    <input
                      type="date"
                      value={proposedDob}
                      onChange={(e) => setProposedDob(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <div className="font-medium">{fmtDate(child.date_of_birth)}</div>
                  )}
                </div>

                {/* Gender */}
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs">Gender</span>
                  {editingChild ? (
                    <input
                      type="text"
                      value={proposedGender}
                      onChange={(e) => setProposedGender(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder={child.gender || ""}
                    />
                  ) : (
                    <div className="font-medium">{child.gender || "—"}</div>
                  )}
                </div>

                {/* Ethnicity */}
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs">Ethnicity</span>
                  {editingChild ? (
                    <input
                      type="text"
                      value={proposedEthnicity}
                      onChange={(e) => setProposedEthnicity(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder={child.ethnicity || ""}
                    />
                  ) : (
                    <div className="font-medium">{child.ethnicity || "—"}</div>
                  )}
                </div>

                {/* Address */}
                <div className="sm:col-span-2 space-y-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500 text-xs">Address line 1</span>
                    {editingChild ? (
                      <input
                        type="text"
                        value={proposedAddressLine1}
                        onChange={(e) => setProposedAddressLine1(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <div className="font-medium">{child.address_line1 || "—"}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500 text-xs">Address line 2</span>
                    {editingChild ? (
                      <input
                        type="text"
                        value={proposedAddressLine2}
                        onChange={(e) => setProposedAddressLine2(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <div className="font-medium">{child.address_line2 || "—"}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-gray-500 text-xs">Town / City</span>
                      {editingChild ? (
                        <input
                          type="text"
                          value={proposedTown}
                          onChange={(e) => setProposedTown(e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <div className="font-medium">{child.town || "—"}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-gray-500 text-xs">Postcode</span>
                      {editingChild ? (
                        <input
                          type="text"
                          value={proposedPostcode}
                          onChange={(e) => setProposedPostcode(e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <div className="font-medium">{child.postcode || "—"}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Start / End dates */}
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs">Start date</span>
                  {editingChild ? (
                    <input
                      type="date"
                      value={proposedStartDate}
                      onChange={(e) => setProposedStartDate(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <div className="font-medium">{fmtDate(child.start_date)}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs">End date</span>
                  {editingChild ? (
                    <input
                      type="date"
                      value={proposedEndDate}
                      onChange={(e) => setProposedEndDate(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <div className="font-medium">{fmtDate(child.end_date)}</div>
                  )}
                </div>
              </div>

              {/* Current attendance table */}
              <div className="mt-2">
                <div className="mb-1 text-sm text-gray-500">Current attendance</div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Day</th>
                        <th className="px-3 py-2 text-left font-medium">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        ["Monday", child.hours_mon],
                        ["Tuesday", child.hours_tue],
                        ["Wednesday", child.hours_wed],
                        ["Thursday", child.hours_thu],
                        ["Friday", child.hours_fri],
                      ].map(([label, value]) => (
                        <tr key={label as string}>
                          <td className="px-3 py-2">{label}</td>
                          <td className="px-3 py-2">{fmtHours(value as number | null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Proposed attendance – only show when editing */}
              {editingChild && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-1">
                    Proposed new weekly hours (optional)
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">Mon</span>
                      <input
                        type="number"
                        step="0.5"
                        value={proposedHoursMon}
                        onChange={(e) => setProposedHoursMon(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">Tue</span>
                      <input
                        type="number"
                        step="0.5"
                        value={proposedHoursTue}
                        onChange={(e) => setProposedHoursTue(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">Wed</span>
                      <input
                        type="number"
                        step="0.5"
                        value={proposedHoursWed}
                        onChange={(e) => setProposedHoursWed(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">Thu</span>
                      <input
                        type="number"
                        step="0.5"
                        value={proposedHoursThu}
                        onChange={(e) => setProposedHoursThu(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600">Fri</span>
                      <input
                        type="number"
                        step="0.5"
                        value={proposedHoursFri}
                        onChange={(e) => setProposedHoursFri(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Funding entitlements (current) */}
              <div className="mt-4 text-sm">
                <div className="text-gray-500">Current funding entitlements</div>
                <div className="font-medium">
                  {child.claim_disadvantaged2 ? "Disadvantaged 2s" : ""}
                  {child.claim_disadvantaged2 && child.claim_working_parent ? " + " : ""}
                  {child.claim_working_parent ? "Working Parent" : ""}
                  {!child.claim_disadvantaged2 && !child.claim_working_parent ? "None" : ""}
                </div>
              </div>

              {/* Proposed funding & notes only when editing */}
              {editingChild && (
                <>
                  <div className="mt-2 flex flex-col gap-1 text-sm">
                    <label className="text-xs text-gray-600">
                      Proposed change to funding entitlements (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={proposedFunding}
                      onChange={(e) => setProposedFunding(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      placeholder="e.g. 15 hours universal + 15 hours working parent"
                    />
                  </div>

                  <div className="mt-3 flex flex-col gap-1 text-sm">
                    <label className="text-xs text-gray-600">
                      Anything else you would like the nursery to know
                    </label>
                    <textarea
                      rows={3}
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                </>
              )}

              {/* Funding code section (unchanged logic) */}
              <div className="mt-6 rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Funding code</h2>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-gray-500">Code</div>
                    <div className="font-medium">
                      {!!child.claim_working_parent ? (
                        funding?.code || <span className="text-gray-400">— Not set —</span>
                      ) : (
                        <span className="text-gray-400">— Not required —</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Valid from</div>
                    <div className="font-medium">
                      {!!child.claim_working_parent ? (
                        funding?.valid_from ? (
                          fmtDate(funding.valid_from)
                        ) : (
                          <span className="text-gray-400">—</span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Expiry</div>
                    <div className="font-medium">
                      {!!child.claim_working_parent ? (
                        funding?.expiry_date ? (
                          fmtDate(funding.expiry_date)
                        ) : (
                          <span className="text-gray-400">—</span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {requiresCode && (
                  <form
                    className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget as HTMLFormElement;
                      const formData = new FormData(form);
                      const code = (formData.get("code") as string)?.trim();
                      const expiry = (formData.get("expiry") as string) || undefined;

                      if (!code) {
                        alert("Please enter a code.");
                        return;
                      }

                      try {
                        await saveFundingCode(code, expiry);
                        form.reset();
                      } catch {
                        // handled in saveFundingCode
                      }
                    }}
                  >
                    <input
                      name="code"
                      placeholder="Enter HMRC code"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <input
                      name="expiry"
                      type="date"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      disabled={saving}
                    >
                      {funding?.code ? "Renew code" : "Save code"}
                    </button>
                  </form>
                )}
              </div>

              {/* Last updated + Request edits / Submit change request */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">
                  Last updated: {fmtDateTime(lastUpdated)}
                </div>
                <div className="flex items-center gap-2">
                  {requestError && (
                    <div className="text-xs text-amber-700">{requestError}</div>
                  )}
                  {requestSuccess && (
                    <div className="text-xs text-emerald-700">{requestSuccess}</div>
                  )}
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm disabled:opacity-60"
                  >
                    {editingChild
                      ? requestSubmitting
                        ? "Submitting…"
                        : "Submit change request"
                      : "Request edits"}
                  </button>
                </div>
              </div>
            </form>
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
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function NewChildClient() {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [dob, setDob] = React.useState(""); // YYYY-MM-DD
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/parent/profile");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/parent/children", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dob,
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
      router.replace(`/parent/children/${j.id}`);
    } catch (e: any) {
      setError(e?.message || "Failed to create child");
      setSubmitting(false);
    }
  }

  return (
    <>
      <FixedBackHeader onBack={goBack} />
      <div className="min-h-screen bg-neutral-900 pt-12">
        <div className="mx-auto max-w-screen-sm p-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-gray-900">
            <h1 className="text-lg font-semibold">Add child</h1>
            {error ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                {error}
              </div>
            ) : null}

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm text-gray-600">First name</label>
                <input
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Last name</label>
                <input
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Date of birth</label>
                <input
                  type="date"
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Dates display as DD/MM/YYYY in the app.</p>
              </div>

              <button
                type="submit"
                className="h-10 w-full rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "Creating…" : "Create child"}
              </button>
            </form>

            <div className="mt-4">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                onClick={goBack}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Fixed header that inherits page background and shows a plain white back glyph */
function FixedBackHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-inherit">
      <div className="mx-auto max-w-screen-sm h-12 px-3 flex items-center">
        <button
          onClick={onBack}
          aria-label="Back"
          className="h-10 w-10 -ml-1 text-white text-2xl leading-none flex items-center justify-center focus:outline-none"
        >
          ‹
        </button>
      </div>
    </div>
  );
}
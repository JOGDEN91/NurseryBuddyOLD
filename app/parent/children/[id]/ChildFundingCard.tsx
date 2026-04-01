// app/parent/children/[id]/ChildFundingCard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChildDetails = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth?: string | null;
  organisation_name?: string | null;
  nursery_name?: string | null;
  claim_working_parent?: boolean | null;
  claim_disadvantaged2?: boolean | null;
  // Optional: if your API already includes LA info, these will be used.
  la_id?: string | null;
  la_name?: string | null;
};

type FundingCode = {
  code: string | null;
  expiry_date: string | null;
};

type ChildApiPayload = {
  ok: boolean;
  child?: ChildDetails | null;
  funding?: FundingCode | null;
  // Optional: if you attach la_id at the top level in future
  la_id?: string | null;
  la_name?: string | null;
};

type LaTermRow = {
  id: string;
  term_name: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

type LaTermApiResponse = {
  ok: boolean;
  items?: LaTermRow[];
  error?: string;
};

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function ageAt(dateOfBirth: Date, at: Date) {
  let years = at.getFullYear() - dateOfBirth.getFullYear();
  let months = at.getMonth() - dateOfBirth.getMonth();
  if (at.getDate() < dateOfBirth.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}

function addYears(d: Date, years: number) {
  const result = new Date(d);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

// Fallback UK-style term model: Spring (Jan), Summer (Apr), Autumn (Sep)
function fallbackNextTermAfter(date: Date) {
  const year = date.getFullYear();
  const spring = new Date(year, 0, 1); // Jan 1
  const summer = new Date(year, 3, 1); // Apr 1
  const autumn = new Date(year, 8, 1); // Sep 1

  if (date < spring) return { name: "Spring term", start: spring };
  if (date < summer) return { name: "Summer term", start: summer };
  if (date < autumn) return { name: "Autumn term", start: autumn };

  const nextSpring = new Date(year + 1, 0, 1);
  return { name: "Spring term", start: nextSpring };
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ChildFundingCard({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildDetails | null>(null);
  const [funding, setFunding] = useState<FundingCode | null>(null);
  const [laTerms, setLaTerms] = useState<LaTermRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;

    (async () => {
      setLoading(true);
      setError(null);
      setLaTerms(null);

      try {
        // 1) Load child funding payload
        const res = await fetch(`/api/parent/children/${childId}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        const json: ChildApiPayload = text ? JSON.parse(text) : { ok: false };
        if (!res.ok || json.ok === false || !json.child) {
          throw new Error(json?.["error"] || "Could not load funding details");
        }
        if (cancel) return;

        setChild(json.child);
        setFunding(json.funding ?? null);

        // 2) Try to determine la_id for this child (now or in future API versions)
        const laId =
          json.la_id ??
          json.child.la_id ??
          // you might later add la_id under a nested nursery object; keep this
          (json as any)?.nursery?.la_id ??
          null;

        if (laId) {
          try {
            const tRes = await fetch(`/api/la/${laId}/term-dates`, {
              method: "GET",
              cache: "no-store",
              credentials: "include",
            });
            const tJson: LaTermApiResponse = await tRes
              .json()
              .catch(() => ({ ok: false, error: "Invalid term-dates response" }));
            if (!cancel && tRes.ok && tJson.ok && Array.isArray(tJson.items)) {
              setLaTerms(tJson.items ?? []);
            }
          } catch {
            // If LA term-dates fail for any reason, we just fall back to generic term pattern
          }
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Failed to load funding details");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [childId]);

  const summary = useMemo(() => {
    if (!child) return null;

    const today = new Date();
    const dob = parseDateSafe(child.date_of_birth ?? null);
    const age = dob ? ageAt(dob, today) : null;
    const thirdBirthday = dob ? addYears(dob, 3) : null;
    const secondBirthday = dob ? addYears(dob, 2) : null;

    const workingParent = !!child.claim_working_parent;
    const disadvantaged2 = !!child.claim_disadvantaged2;

    const currentEntitlements: string[] = [];
    const currentReasons: string[] = [];
    const possibleEntitlements: string[] = [];
    const upcomingEntitlements: {
      title: string;
      detail: string;
    }[] = [];

    // Helper: pick next LA term after a given date, if we have laTerms
    let laNextTerm:
      | {
          name: string;
          start: Date;
        }
      | null = null;

    if (thirdBirthday && laTerms && laTerms.length > 0) {
      const candidates: { name: string; start: Date }[] = [];
      for (const t of laTerms) {
        const start = parseDateSafe(t.start_date);
        if (!start) continue;
        if (start.getTime() >= thirdBirthday.getTime()) {
          candidates.push({ name: t.term_name, start });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
        laNextTerm = candidates[0];
      }
    }

    // Current – based on flags + age
    if (dob && age) {
      if (disadvantaged2 && age.years === 2) {
        currentEntitlements.push("15 hours for eligible 2-year-olds");
        currentReasons.push(
          "Your nursery has recorded that your child meets the eligibility criteria for 2-year-old funding."
        );
      }

      if (age.years >= 3) {
        currentEntitlements.push("Universal 15 hours for 3 and 4-year-olds");
        currentReasons.push(
          "Children in England are usually entitled to 15 funded hours from the term after they turn 3."
        );
        if (workingParent) {
          currentEntitlements.push(
            "Additional 15 hours for eligible working parents (up to 30 hours total)"
          );
          currentReasons.push(
            "Your nursery has recorded that your household meets the working parent criteria and has a valid code."
          );
        } else {
          // Possible 30 hours if not currently flagged
          possibleEntitlements.push(
            "Up to 30 hours for eligible working parents (an extra 15 hours on top of the universal 15)."
          );
        }
      } else {
        // Under 3 – may be coming up
        if (!disadvantaged2 && age.years === 2) {
          possibleEntitlements.push(
            "15 hours for eligible 2-year-olds, depending on household circumstances."
          );
        }
      }

      // Upcoming universal 15 (term after 3rd birthday)
      if (thirdBirthday && thirdBirthday > today) {
        const term =
          laNextTerm ??
          fallbackNextTermAfter(thirdBirthday);

        const usingLaDates = Boolean(laNextTerm);

        upcomingEntitlements.push({
          title: "Universal 15 hours from the term after their 3rd birthday",
          detail: usingLaDates
            ? `Based on your child’s date of birth and your local authority’s term dates, this is likely from the ${term.name} starting around ${fmtDate(
                term.start
              )}. Exact dates may vary slightly by school or provider – your nursery will confirm.`
            : `Based on your child’s date of birth, this is likely from the ${term.name} starting around ${fmtDate(
                term.start
              )}. Your local authority’s exact term dates may differ slightly – your nursery will confirm.`,
        });
      }

      // Upcoming working parent suggestion (if age will be 3 soon and not yet working-parent flagged)
      if (thirdBirthday && thirdBirthday > today && !workingParent) {
        upcomingEntitlements.push({
          title: "Up to 30 hours if you are working",
          detail:
            "If you (and your partner, if you have one) are working and meet the income criteria, you may be able to claim an additional 15 hours on top of the universal 15. You would need to apply through the government childcare service and share your code with the nursery.",
        });
      }
    }

    return {
      dob,
      age,
      workingParent,
      disadvantaged2,
      currentEntitlements,
      currentReasons,
      possibleEntitlements,
      upcomingEntitlements,
    };
  }, [child, laTerms]);

  if (!child) {
    if (loading) {
      return (
        <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
          <div className="mt-3 h-16 animate-pulse rounded bg-gray-100" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="mt-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          {error}
        </div>
      );
    }
    return null;
  }

  const orgName =
    child.organisation_name && child.nursery_name
      ? `${child.organisation_name} – ${child.nursery_name}`
      : child.nursery_name || child.organisation_name || "";

  const fundingCode = funding?.code || null;
  const fundingCodeExpiry = parseDateSafe(funding?.expiry_date ?? null);

  return (
    <div className="mt-0 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Funding for {childName}</h2>
        {orgName && (
          <span className="text-[11px] text-gray-500 truncate max-w-[50%] text-right">
            {orgName}
          </span>
        )}
      </div>

      {/* Child & age */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-gray-500">Date of birth</div>
          <div className="font-medium">
            {child.date_of_birth
              ? parseDateSafe(child.date_of_birth)?.toLocaleDateString(
                  "en-GB",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                )
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Age now</div>
          <div className="font-medium">
            {summary?.age
              ? `${summary.age.years} year${
                  summary.age.years === 1 ? "" : "s"
                } ${summary.age.months} month${
                  summary.age.months === 1 ? "" : "s"
                }`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Funding code (if required)</div>
          <div className="font-medium">
            {summary?.workingParent ? (
              fundingCode ? (
                <>
                  <div>{fundingCode}</div>
                  {fundingCodeExpiry && (
                    <div className="text-[11px] text-gray-500">
                      Expires {fmtDate(fundingCodeExpiry)}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-gray-400">
                  Code not yet provided – your nursery may ask you to upload one.
                </span>
              )
            ) : (
              <span className="text-gray-400">
                Not required for current funding
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Current entitlements */}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
        <div className="font-semibold mb-2">Current entitlements</div>
        {summary?.currentEntitlements &&
        summary.currentEntitlements.length > 0 ? (
          <ul className="list-disc list-inside space-y-1">
            {summary.currentEntitlements.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">
            Your nursery has not yet recorded any funded entitlements for this child.
            This may change once your child reaches the relevant age or eligibility is
            confirmed.
          </p>
        )}

        {summary?.currentReasons && summary.currentReasons.length > 0 && (
          <div className="mt-2 space-y-1 text-xs text-gray-600">
            {summary.currentReasons.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        )}
      </div>

      {/* Possible / “you may also be able to claim” */}
      {summary?.possibleEntitlements &&
        summary.possibleEntitlements.length > 0 && (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm">
            <div className="font-semibold mb-2">You may also be able to claim</div>
            <ul className="list-disc list-inside space-y-1">
              {summary.possibleEntitlements.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gray-600">
              Eligibility for these entitlements depends on your household circumstances
              and government rules. Your nursery or local authority can confirm what
              applies to you.
            </p>
          </div>
        )}

      {/* Upcoming entitlements by term */}
      {summary?.upcomingEntitlements &&
        summary.upcomingEntitlements.length > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm">
            <div className="font-semibold mb-2">What&apos;s coming up next</div>
            <ul className="space-y-2">
              {summary.upcomingEntitlements.map((u, idx) => (
                <li key={idx}>
                  <div className="font-medium">{u.title}</div>
                  <div className="text-xs text-gray-700 mt-0.5">{u.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gray-600">
              Where possible, we use your local authority&apos;s published term dates.
              Exact arrangements can still vary slightly by school or provider –
              your nursery will confirm the final start dates for funded hours.
            </p>
          </div>
        )}

      {/* Next steps */}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
        <div className="font-semibold text-sm mb-1">What you can do next</div>
        <ul className="list-disc list-inside space-y-1">
          <li>
            If anything above doesn&apos;t look right, you can request an update from
            your nursery via the child profile or by contacting them directly.
          </li>
          <li>
            For working parent entitlements (up to 30 funded hours), you usually need an
            11-digit code from the government childcare service. Your nursery can guide
            you through this.
          </li>
          <li>
            Your local authority may publish detailed guides about funded childcare. This
            page is designed to summarise your position, not replace their official
            information.
          </li>
        </ul>
      </div>
    </div>
  );
}

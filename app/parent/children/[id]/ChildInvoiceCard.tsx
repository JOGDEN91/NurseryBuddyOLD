// app/parent/children/[id]/ChildInvoiceCard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type InvoiceMode = "monthly" | "termly";
type DocStatus = "missing" | "requested" | "pending" | "verified" | "review";

type ChildDetails = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nursery_id: string | null;
  hours_mon: number | null;
  hours_tue: number | null;
  hours_wed: number | null;
  hours_thu: number | null;
  hours_fri: number | null;
  claim_working_parent?: boolean | null;
  claim_disadvantaged2?: boolean | null;
};

type ChildApiPayload = {
  ok: boolean;
  child?: ChildDetails | null;
};

type SettingsPayload = {
  ok?: boolean;
  settings?: {
    invoice_mode: InvoiceMode | null;
    hourly_rate: number | null;
    additional_hourly_rate: number | null;
    stretched_weeks: number | null;
    annual_cap_15: number | null;
    annual_cap_30: number | null;
  } | null;
  error?: string;
};

type ConsumableItem = {
  id: string;
  description: string;
  scope?: "org" | "nursery" | null;
  amount_15: number | null;
  amount_30: number | null;
  funded_band?: number | null;
  amount?: number | null;
};

type ConsumablesPayload = {
  items?: ConsumableItem[];
  optedOut?: Record<string, boolean>;
  band?: number | null;
  ok?: boolean;
  error?: string;
};

type FundingBand = 0 | 15 | 30;

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "£0.00";
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}
function fmtHours(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "0";
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
}

export function ChildInvoiceCard({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildDetails | null>(null);
  const [settings, setSettings] = useState<SettingsPayload["settings"] | null>(null);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Child details
        const childRes = await fetch(`/api/parent/children/${childId}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const childText = await childRes.text();
        const childJson: ChildApiPayload = childText
          ? JSON.parse(childText)
          : { ok: false };
        if (!childRes.ok || childJson.ok === false || !childJson.child) {
          throw new Error(childJson?.["error"] || "Could not load child details");
        }
        if (cancel) return;
        setChild(childJson.child);

        const nurseryId = childJson.child.nursery_id;
        if (!nurseryId) {
          throw new Error("This child is not linked to a nursery yet.");
        }

        // 2) Effective settings for this nursery
        const settingsUrl = new URL("/api/settings", window.location.origin);
        settingsUrl.searchParams.set("nurseryId", nurseryId);
        const settingsRes = await fetch(settingsUrl.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const settingsJson: SettingsPayload = await settingsRes
          .json()
          .catch(() => ({ ok: false, error: "Invalid settings response" }));
        if (!settingsRes.ok || settingsJson.settings == null) {
          throw new Error(settingsJson.error || "Could not load settings");
        }
        if (cancel) return;
        setSettings(settingsJson.settings);

                // 3) Consumables for this child (effective, respecting opt-outs)
        const consRes = await fetch(
          `/api/children/${encodeURIComponent(childId)}/consumables`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          }
        );
        const consJson: ConsumablesPayload = await consRes
          .json()
          .catch(() => ({ ok: false, error: "Invalid consumables response" }));
        if (!consRes.ok) {
          throw new Error(consJson.error || "Could not load consumables");
        }
        if (cancel) return;

        const rawItems = Array.isArray(consJson.items)
          ? (consJson.items as ConsumableItem[])
          : [];
        const optedOutMap = consJson.optedOut || {};

        // Effective consumables = those not opted out for this child
        const effectiveItems = rawItems.filter((it) => {
          const scope = it.scope ?? "nursery";
          const key = `${scope}:${it.id}`;
          return !optedOutMap[key];
        });

        setConsumables(effectiveItems);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Failed to load invoice estimate");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [childId]);

  const summary = useMemo(() => {
    if (!child || !settings) return null;

    const invoiceMode: InvoiceMode = settings.invoice_mode ?? "monthly";
    const stretchedWeeks = settings.stretched_weeks || 38;

    const attendedWeek =
      (child.hours_mon ?? 0) +
      (child.hours_tue ?? 0) +
      (child.hours_wed ?? 0) +
      (child.hours_thu ?? 0) +
      (child.hours_fri ?? 0);

    // Determine funding band (15h vs 30h) – tweak this mapping if you have more flags
    let band: FundingBand = 0;
    if (child.claim_working_parent) band = 30;
    else if (child.claim_disadvantaged2) band = 15;

    const annualCap15 = settings.annual_cap_15 ?? 570;
    const annualCap30 = settings.annual_cap_30 ?? 1140;

    const annualFunded =
      band === 30 ? annualCap30 : band === 15 ? annualCap15 : 0;

    const fundedPerWeek =
      annualFunded > 0 && stretchedWeeks > 0
        ? annualFunded / stretchedWeeks
        : 0;

    const additionalHourlyRate = settings.additional_hourly_rate ?? 0;
    const extraHoursPerWeek = Math.max(0, attendedWeek - fundedPerWeek);
    const weeksPerYear = stretchedWeeks || 52;
    const extraHoursPerYear = extraHoursPerWeek * weeksPerYear;
    const extraCostPerYear = extraHoursPerYear * additionalHourlyRate;

    const extraCostPerPeriod =
      invoiceMode === "monthly" ? extraCostPerYear / 12 : extraCostPerYear / 3;

        // Consumables: amounts in DB are PER TERM.
    // Termly invoices: show full term amount.
    // Monthly invoices: term is split into 4 monthly invoices.
    let consumableLines: { description: string; amount: number }[] = [];
    let consumableTotal = 0;

    consumables.forEach((item) => {
      // Step 1: work out the TERM amount for this child's band
      let termAmount = 0;

      if (band === 30) {
        // Prefer 30h-specific term amount, fall back to generic amount for 30h if present
        termAmount =
          item.amount_30 ??
          (item.funded_band === 30 && item.amount != null ? item.amount : 0) ??
          0;
      } else if (band === 15) {
        // Prefer 15h-specific term amount, fall back to generic amount for 15h
        termAmount =
          item.amount_15 ??
          (item.funded_band === 15 && item.amount != null ? item.amount : 0) ??
          0;
      } else {
        termAmount = 0;
      }

      if (termAmount <= 0) return;

      // Step 2: convert term amount to THIS invoice’s amount
      const amountPerInvoice =
        invoiceMode === "monthly" ? termAmount / 4 : termAmount; // termly uses full amount

      if (amountPerInvoice > 0) {
        consumableLines.push({
          description: item.description,
          amount: amountPerInvoice,
        });
        consumableTotal += amountPerInvoice;
      }
    });

    const estimatedTotal = extraCostPerPeriod + consumableTotal;

    return {
      invoiceMode,
      attendedWeek,
      band,
      annualFunded,
      stretchedWeeks,
      fundedPerWeek,
      additionalHourlyRate,
      extraHoursPerWeek,
      extraCostPerPeriod,
      consumableLines,
      consumableTotal,
      estimatedTotal,
    };
  }, [child, settings, consumables]);

  if (!child || !settings) {
    if (loading) {
      return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm mt-2">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
          <div className="mt-3 h-16 animate-pulse rounded bg-gray-100" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 mt-2">
          {error}
        </div>
      );
    }
    return null;
  }

  if (!summary) return null;

  const {
    invoiceMode,
    attendedWeek,
    band,
    annualFunded,
    stretchedWeeks,
    fundedPerWeek,
    additionalHourlyRate,
    extraHoursPerWeek,
    extraCostPerPeriod,
    consumableLines,
    consumableTotal,
    estimatedTotal,
  } = summary;

  const modeLabel =
    invoiceMode === "monthly" ? "per month (estimate)" : "per term (estimate)";

  return (
    <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Invoices & payments</h2>
        <span className="text-xs text-gray-500">
          Based on current attendance and nursery settings
        </span>
      </div>

      {/* Top summary */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-gray-500">Child</div>
          <div className="font-medium">{childName || "Unnamed"}</div>
        </div>
        <div>
          <div className="text-gray-500">Invoice mode</div>
          <div className="font-medium capitalize">{invoiceMode}</div>
        </div>
        <div>
          <div className="text-gray-500">Stretched weeks</div>
          <div className="font-medium">
            {stretchedWeeks ? `${stretchedWeeks} weeks` : "—"}
          </div>
        </div>
      </div>

      {/* Hours breakdown */}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
        <div className="font-semibold mb-2">Hours</div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Total hours attended per week</dt>
            <dd className="font-medium">{fmtHours(attendedWeek)} hours</dd>
          </div>
          <div>
            <dt className="text-gray-500">
              Total funded hours available annually
            </dt>
            <dd className="font-medium">
              {band === 0
                ? "No funded entitlement"
                : `${fmtHours(annualFunded)} hours (${band}h pattern)`}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Total funded hours per week</dt>
            <dd className="font-medium">
              {fmtHours(fundedPerWeek)} hours / week
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Additional hours per week</dt>
            <dd className="font-medium">
              {fmtHours(extraHoursPerWeek)} hours / week
            </dd>
          </div>
        </dl>
      </div>

      {/* Rates & consumables */}
      <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="font-semibold mb-2">Rates</div>
          <dl className="space-y-2">
            <div>
              <dt className="text-gray-500">Additional hourly rate</dt>
              <dd className="font-medium">
                {fmtMoney(additionalHourlyRate)} / hour
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">
                Estimated additional hours charge {modeLabel}
              </dt>
              <dd className="font-medium">{fmtMoney(extraCostPerPeriod)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="font-semibold mb-2">Consumable charges</div>
          {band === 0 ? (
            <p className="text-xs text-gray-500">
              Consumables apply to funded children. This child currently has no
              funded entitlement.
            </p>
          ) : consumableLines.length === 0 ? (
            <p className="text-xs text-gray-500">
              No consumables have been configured for this nursery yet.
            </p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {consumableLines.map((c) => (
                  <li
                    key={c.description}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{c.description}</span>
                    <span className="font-medium">
                      {fmtMoney(c.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t pt-2 flex items-center justify-between text-sm">
                <span className="font-semibold">Total consumables</span>
                <span className="font-semibold">
                  {fmtMoney(consumableTotal)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Estimated total */}
<div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm">
  <div className="text-gray-600 text-xs uppercase tracking-wide">
    Estimated total amount payable
  </div>

  {/* Big figure first */}
  <div className="mt-1 flex items-baseline gap-2">
    <div className="text-2xl font-bold">
      {fmtMoney(estimatedTotal)}
    </div>
    <div className="text-[11px] text-gray-600">{modeLabel}</div>
  </div>

  {/* Caveat underneath, full width */}
  <p className="mt-2 text-[11px] leading-snug text-gray-500">
    This estimate assumes a full month or term of attendance from the start of
    the period in question. Invoices may differ depending on your child&apos;s
    actual attendance in any given period, plus the start and end dates if they
    fall midway through a billing or funding period, as well as any ad-hoc
    sessions and other adjustments.
  </p>
</div>
    </div>
  );
}
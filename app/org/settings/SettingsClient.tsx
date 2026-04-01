"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/scope/ScopeProvider";

/* ---------- Types ---------- */
type InvoiceMode = "monthly" | "termly";
type DeclarationMode = "one_off" | "termly";

type BaseSettings = {
  org_id: string | null;
  nursery_id: string | null;
  invoice_mode: InvoiceMode | null;
  hourly_rate: number | null;
  additional_hourly_rate: number | null;
  funding_hourly_rate?: number | null; // read-only (LA)
  stretched_weeks: number | null;
  financial_year_end: string | null;
  annual_cap_15: number | null;
  annual_cap_30: number | null;
  declaration_mode?: DeclarationMode | null;
  declaration_lead_days?: number | null;
  declaration_intro_text?: string | null;
  declaration_reconfirm_text?: string | null;
  declaration_privacy_text?: string | null;
  declaration_privacy_url?: string | null;
};

type EffectiveSettings = Required<
  Omit<
    BaseSettings,
    "invoice_mode" | "declaration_mode" | "declaration_lead_days"
  >
> & {
  invoice_mode: InvoiceMode;
  declaration_mode?: DeclarationMode | null;
  declaration_lead_days?: number | null;
};

type ConsumableRow = {
  orgId?: string;
  nurseryId?: string;
  description: string;
  org15: number | null;
  org30: number | null;
  nur15: number | null;
  nur30: number | null;
};

/* ---------- Styles ---------- */
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 12,
};
const inputCss: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
};
const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DADADA",
  background: "#fff",
  color: "#24364B",
  fontWeight: 700,
  cursor: "pointer",
};
const subtle: React.CSSProperties = { fontSize: 12, color: "#6C7A89" };

/* ---------- Utils ---------- */
function parseMoneyLoose(v: string): number {
  const t = (v || "").trim().replace(/[£,\s]/g, "");
  if (!t) return 0;
  const s = t.startsWith(".") ? `0${t}` : t;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const toStr = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "" : String(n);

/* ---------- Pill Switcher ---------- */
function PillSwitcher({
  value,
  onChange,
}: {
  value: "organisation" | "nursery";
  onChange: (v: "organisation" | "nursery") => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        border: "1px solid #E6E4E0",
        background: "#FFF",
      }}
    >
      {(["organisation", "nursery"] as const).map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            type="button"
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              background: active ? "#4CAF78" : "transparent",
              color: active ? "#fff" : "#24364B",
              minWidth: 110,
            }}
          >
            {k === "organisation" ? "Organisation" : "Nursery"}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Reusable compare row for Nursery tab ---------- */
function RowCompare({
  label,
  orgRender,
  nurRender,
}: {
  label: string;
  orgRender: () => React.ReactNode;
  nurRender: () => React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr 1fr",
        gap: 12,
      }}
    >
      <div style={{ alignSelf: "center" }}>{label}</div>
      <div>{orgRender()}</div>
      <div>{nurRender()}</div>
    </div>
  );
}

/* ---------- Component ---------- */
export default function SettingsClient({
  orgId,
  orgName,
  nurseries,
  localAuthorities = [],
}: {
  orgId: string | null;
  orgName: string;
  nurseries: Array<{ id: string; name: string; laId?: string | null }>;
  localAuthorities?: Array<{ id: string; name: string }>;
}) {
  const { nurseryId: scopedNurseryId } = useScope();

  const [mode, setMode] = useState<"organisation" | "nursery">("organisation");
  const [nurseryId, setNurseryId] = useState<string | null>(
    scopedNurseryId ?? nurseries[0]?.id ?? null
  );
  const effectiveNurseryId = nurseryId;

  const selectedNursery = useMemo(
    () => nurseries.find((n) => n.id === effectiveNurseryId) ?? null,
    [nurseries, effectiveNurseryId]
  );
  const selectedNurseryName = selectedNursery?.name ?? "";

  // Local authority for the selected nursery
  const [laValue, setLaValue] = useState<string>("");

  useEffect(() => {
    setLaValue(((selectedNursery as any)?.laId as string | null) ?? "");
  }, [selectedNursery]);

  // Settings state
  const [effective, setEffective] = useState<EffectiveSettings | null>(null);
  const [orgDefaults, setOrgDefaults] = useState<BaseSettings | null>(null);
  const [nurseryOverrides, setNurseryOverrides] = useState<BaseSettings | null>(
    null
  );
  const [requiresTwoParents, setRequiresTwoParents] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // decimal-friendly inputs for the visible pane
  const [rateStr, setRateStr] = useState("");
  const [addlStr, setAddlStr] = useState("");

  // Consumables (use for current pane)
  const [consRows, setConsRows] = useState<ConsumableRow[]>([]);
  const [consLoading, setConsLoading] = useState(false);
  const [addDesc, setAddDesc] = useState("");
  const [add15, setAdd15] = useState("");
  const [add30, setAdd30] = useState("");

  function qs(scope: "org" | "nursery") {
    const p = new URLSearchParams();
    p.set("scope", scope);
    if (scope === "org") p.set("orgId", orgId ?? "");
    else p.set("nurseryId", effectiveNurseryId ?? "");
    return p.toString();
  }
  function setNurseryField<K extends keyof BaseSettings>(k: K, v: any) {
    setNurseryOverrides((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  /* ---------- Loads ---------- */
  async function loadAll() {
    if (!effectiveNurseryId) return;

    // load LA flags for the nursery
    if (mode === "nursery" && effectiveNurseryId) {
      const resFlags = await fetch(
        `/api/nursery-flags?nurseryId=${encodeURIComponent(
          effectiveNurseryId
        )}`,
        { cache: "no-store", credentials: "include" }
      );
      const jf = await resFlags.json().catch(() => ({}));
      if (resFlags.ok) {
        setRequiresTwoParents(!!jf.requires_two_parents_details);
      }
    }

    setLoading(true);
    setBanner(null);

    try {
      // 1) Effective (what Finance uses)
      const effUrl = new URL("/api/settings", window.location.origin);
      effUrl.searchParams.set("nurseryId", effectiveNurseryId);
      const effRes = await fetch(effUrl.toString(), {
        cache: "no-store",
        credentials: "include",
      });
      const effJson = await effRes.json();
      if (!effRes.ok)
        throw new Error(effJson?.error || "Failed to load settings");
      const effSettings = (effJson.settings ?? null) as
        | EffectiveSettings
        | null;

      // 2) Org raw row
      const orgRes = await fetch(
        `/api/settings?scope=org&orgId=${encodeURIComponent(orgId ?? "")}`,
        { cache: "no-store", credentials: "include" }
      );
      const orgJson = await orgRes.json().catch(() => ({}));
      const orgRow = orgRes.ok
        ? ((orgJson.settings ?? null) as BaseSettings | null)
        : null;

      // 3) Nursery raw row (only when on Nursery tab)
      let nurRow: BaseSettings | null = null;
      if (mode === "nursery") {
        const nurRes = await fetch(
          `/api/settings?scope=nursery&nurseryId=${encodeURIComponent(
            effectiveNurseryId
          )}`,
          { cache: "no-store", credentials: "include" }
        );
        const nurJson = await nurRes.json().catch(() => ({}));
        nurRow = nurRes.ok
          ? ((nurJson.settings ?? null) as BaseSettings | null)
          : null;
      }

      // Commit
      const eff: EffectiveSettings | null = effSettings
        ? {
            ...effSettings,
            declaration_mode:
              (effSettings.declaration_mode as DeclarationMode | null) ??
              "termly",
            declaration_lead_days: effSettings.declaration_lead_days ?? 28,
          }
        : null;

      setEffective(eff);
      setOrgDefaults(orgRow);
      setNurseryOverrides(nurRow);

      // seed visible input strings
      if (mode === "organisation") {
        const src = (orgRow ?? eff) as BaseSettings | EffectiveSettings | null;
        setRateStr(src?.hourly_rate != null ? String(src.hourly_rate) : "");
        setAddlStr(
          src?.additional_hourly_rate != null
            ? String(src.additional_hourly_rate)
            : ""
        );
      } else {
        setRateStr(
          nurRow?.hourly_rate != null ? String(nurRow.hourly_rate) : ""
        );
        setAddlStr(
          nurRow?.additional_hourly_rate != null
            ? String(nurRow.additional_hourly_rate)
            : ""
        );
      }
    } catch (e: any) {
      setBanner(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAll();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveNurseryId]);

  // Broadcast scope so FundingRatesClient follows the same switcher
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("org-settings-scope", {
        detail: { mode, nurseryId: effectiveNurseryId ?? null },
      })
    );
  }, [mode, effectiveNurseryId]);

  /* ---------- Consumables loaders (depending on pane) ---------- */
  async function loadConsumablesForOrganisation() {
    setConsLoading(true);
    try {
      const resOrg = await fetch(`/api/consumables?${qs("org")}`, {
        cache: "no-store",
        credentials: "include",
      });
      const jOrg = await resOrg.json();
      const orgList: ConsumableRow[] = (jOrg.items ?? []).map((r: any) => ({
        orgId: r.id,
        description: r.description,
        org15: r.amount_15 ?? (r.funded_band === 15 ? r.amount ?? null : null),
        org30: r.amount_30 ?? (r.funded_band === 30 ? r.amount ?? null : null),
        nur15: null,
        nur30: null,
      }));
      setConsRows(
        orgList.sort((a, b) => a.description.localeCompare(b.description))
      );
    } finally {
      setConsLoading(false);
    }
  }

  async function loadConsumablesForNursery() {
    setConsLoading(true);
    try {
      const [resOrg, resNur] = await Promise.all([
        fetch(`/api/consumables?${qs("org")}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/consumables?${qs("nursery")}`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      const [jOrg, jNur] = await Promise.all([resOrg.json(), resNur.json()]);

      const map = new Map<string, ConsumableRow>();
      for (const r of jOrg.items ?? []) {
        map.set(r.description, {
          description: r.description,
          org15:
            r.amount_15 ?? (r.funded_band === 15 ? r.amount ?? null : null),
          org30:
            r.amount_30 ?? (r.funded_band === 30 ? r.amount ?? null : null),
          nur15: null,
          nur30: null,
        });
      }
      for (const r of jNur.items ?? []) {
        const k = r.description;
        const existing = map.get(k) ?? {
          description: r.description,
          org15: null,
          org30: null,
          nur15: null,
          nur30: null,
        };
        const merged: ConsumableRow = {
          ...existing,
          nur15:
            r.amount_15 ??
            (r.funded_band === 15 ? r.amount ?? null : existing.nur15),
          nur30:
            r.amount_30 ??
            (r.funded_band === 30 ? r.amount ?? null : existing.nur30),
        };
        map.set(k, merged);
      }

      setConsRows(
        Array.from(map.values()).sort((a, b) =>
          a.description.localeCompare(b.description)
        )
      );
    } finally {
      setConsLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "organisation") loadConsumablesForOrganisation();
    else loadConsumablesForNursery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nurseryId]);

  async function saveNurseryLa() {
    if (!effectiveNurseryId) return;
    setSaving(true);
    setBanner(null);
    try {
      // 1) Save LA mapping
      const res = await fetch("/api/nursery-la", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          nursery_id: effectiveNurseryId,
          la_id: laValue || null, // allow clearing
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(j?.error || "Failed to save local authority");

      // 2) Save LA-specific flag for this nursery
      const flagsRes = await fetch("/api/nursery-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          nursery_id: effectiveNurseryId,
          requires_two_parents_details: requiresTwoParents,
        }),
      });
      const fj = await flagsRes.json().catch(() => ({}));
      if (!flagsRes.ok) {
        console.warn("nursery-flags save error", fj?.error);
        throw new Error(fj?.error || "Failed to save LA requirements");
      }

      setBanner("Local authority & requirements saved.");
    } catch (e: any) {
      setBanner(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- SAVE (Organisation) ---------- */
  async function saveOrganisation() {
    if (!orgId) return;
    setSaving(true);
    setBanner(null);
    try {
      const body: any = {
        scope: "org",
        org_id: orgId,
        invoice_mode: (orgDefaults?.invoice_mode ??
          effective?.invoice_mode ??
          "monthly") as InvoiceMode,
        hourly_rate: rateStr === "" ? null : parseMoneyLoose(rateStr),
        additional_hourly_rate:
          addlStr === "" ? null : parseMoneyLoose(addlStr),
        stretched_weeks:
          orgDefaults?.stretched_weeks ?? effective?.stretched_weeks ?? null,
        financial_year_end:
          orgDefaults?.financial_year_end ??
          effective?.financial_year_end ??
          null,
        annual_cap_15:
          orgDefaults?.annual_cap_15 ?? effective?.annual_cap_15 ?? 570,
        annual_cap_30:
          orgDefaults?.annual_cap_30 ?? effective?.annual_cap_30 ?? 1140,
      };

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to save settings");

      // Update local orgDefaults
      setOrgDefaults((prev) =>
        prev
          ? {
              ...prev,
              invoice_mode: body.invoice_mode,
              hourly_rate: body.hourly_rate,
              additional_hourly_rate: body.additional_hourly_rate,
              stretched_weeks: body.stretched_weeks,
              financial_year_end: body.financial_year_end,
              annual_cap_15: body.annual_cap_15,
              annual_cap_30: body.annual_cap_30,
            }
          : (body as BaseSettings)
      );

      // Keep visible strings
      setRateStr(body.hourly_rate != null ? String(body.hourly_rate) : "");
      setAddlStr(
        body.additional_hourly_rate != null
          ? String(body.additional_hourly_rate)
          : ""
      );

      // Update effective cache too
      setEffective((prev) =>
        prev
          ? {
              ...prev,
              invoice_mode: body.invoice_mode,
              hourly_rate: body.hourly_rate ?? prev.hourly_rate,
              additional_hourly_rate:
                body.additional_hourly_rate ?? prev.additional_hourly_rate,
              stretched_weeks: body.stretched_weeks ?? prev.stretched_weeks,
              financial_year_end:
                body.financial_year_end ?? prev.financial_year_end,
              annual_cap_15: body.annual_cap_15 ?? prev.annual_cap_15,
              annual_cap_30: body.annual_cap_30 ?? prev.annual_cap_30,
            }
          : prev
      );

      setBanner("Saved.");
    } catch (e: any) {
      setBanner(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- SAVE (Nursery) ---------- */
  async function saveNursery() {
    if (!effectiveNurseryId) return;
    setSaving(true);
    setBanner(null);
    try {
      const body: any = {
        scope: "nursery",
        nursery_id: effectiveNurseryId,
        invoice_mode:
          (nurseryOverrides?.invoice_mode as InvoiceMode | null) ?? null,
        hourly_rate: rateStr === "" ? null : parseMoneyLoose(rateStr),
        additional_hourly_rate:
          addlStr === "" ? null : parseMoneyLoose(addlStr),
        stretched_weeks: nurseryOverrides?.stretched_weeks ?? null,
        financial_year_end: nurseryOverrides?.financial_year_end ?? null,
        annual_cap_15: nurseryOverrides?.annual_cap_15 ?? null,
        annual_cap_30: nurseryOverrides?.annual_cap_30 ?? null,
        declaration_mode: nurseryOverrides?.declaration_mode ?? null,
        declaration_lead_days:
          nurseryOverrides?.declaration_lead_days ?? null,
        declaration_intro_text:
          nurseryOverrides?.declaration_intro_text ?? null,
        declaration_reconfirm_text:
          nurseryOverrides?.declaration_reconfirm_text ?? null,
        declaration_privacy_text:
          nurseryOverrides?.declaration_privacy_text ?? null,
        declaration_privacy_url:
          nurseryOverrides?.declaration_privacy_url ?? null,
      };

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to save");

      // persist LA requires-two-parents flag on the nursery
      if (effectiveNurseryId) {
        const flagsRes = await fetch("/api/nursery-flags", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            nursery_id: effectiveNurseryId,
            requires_two_parents_details: requiresTwoParents,
          }),
        });
        const fj = await flagsRes.json().catch(() => ({}));
        if (!res.ok) {
          console.warn("nursery-flags save error", fj?.error);
        }
      }

      setBanner("Saved.");
      // refresh to reflect inherited values etc
      await loadAll();
    } catch (e: any) {
      setBanner(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Consumables: add/remove ---------- */
  async function addConsumable() {
    const desc = addDesc.trim();
    const a15 = add15.trim() === "" ? null : parseMoneyLoose(add15);
    const a30 = add30.trim() === "" ? null : parseMoneyLoose(add30);
    if (!desc) return;

    try {
      if (mode === "organisation") {
        const res = await fetch(`/api/consumables?${qs("org")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            description: desc,
            amount_15: a15,
            amount_30: a30,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setBanner(j?.error || "Could not add consumable");
          return;
        }
        await loadConsumablesForOrganisation();
      } else {
        const res = await fetch(`/api/consumables?${qs("nursery")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            description: desc,
            amount_15: a15,
            amount_30: a30,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setBanner(j?.error || "Could not add consumable");
          return;
        }
        await loadConsumablesForNursery();
      }

      setAddDesc("");
      setAdd15("");
      setAdd30("");
    } catch {
      setBanner("Could not add consumable");
    }
  }

  async function deleteConsumable(description: string) {
    try {
      const res = await fetch(
        `/api/consumables?${qs(mode === "organisation" ? "org" : "nursery")}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ description }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Delete failed");
      if (mode === "organisation") await loadConsumablesForOrganisation();
      else await loadConsumablesForNursery();
      setBanner("Removed.");
    } catch (e: any) {
      setBanner(e?.message || "Delete failed");
    }
  }

  /* ---------- Render ---------- */
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {banner && (
        <div
          style={{
            background: "#FFF8E6",
            border: "1px solid #F2D27A",
            color: "#6A4A0C",
            padding: 10,
            borderRadius: 8,
          }}
        >
          {banner}
        </div>
      )}

      {/* Header card with switcher */}
      <div style={{ ...card, display: "grid", gap: 8 }}>
        <div
          style={{
            fontWeight: 800,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Organisation: {orgName || "—"}</span>
          <PillSwitcher value={mode} onChange={setMode} />
        </div>

        {mode === "nursery" && (
          <>
            {/* Nursery selector */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <select
                value={nurseryId ?? ""}
                onChange={(e) => setNurseryId(e.target.value || null)}
                style={{ ...inputCss, minWidth: 260 }}
              >
                {nurseries.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
              <div style={{ ...subtle }}>
                Editing: {selectedNurseryName || "—"}
              </div>
            </div>

            {/* LA selector + save */}
            {localAuthorities.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <div style={{ ...subtle, minWidth: 120 }}>
                    Local authority
                  </div>
                  <select
                    value={laValue}
                    onChange={(e) => setLaValue(e.target.value)}
                    style={{ ...inputCss, minWidth: 260 }}
                  >
                    <option value="">— Not set —</option>
                    {localAuthorities.map((la) => (
                      <option key={la.id} value={la.id}>
                        {la.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={btnGhost}
                    onClick={saveNurseryLa}
                    disabled={!effectiveNurseryId}
                  >
                    Save LA &amp; requirements
                  </button>
                </div>

                {/* LA-specific requirement: both parents' NI & DOB */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ ...subtle, minWidth: 120 }} />
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "flex-start",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requiresTwoParents}
                      onChange={(e) =>
                        setRequiresTwoParents(e.target.checked)
                      }
                    />
                    <span>
                      Local Authority requires <b>National Insurance number</b>{" "}
                      and <b>Date of Birth</b> for both parents (unless marked as
                      a single parent household).
                    </span>
                  </label>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Parameters card */}
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 800 }}>Data Parameters</div>

        {loading || !effective ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : mode === "organisation" ? (
          <>
            <div style={{ ...subtle, marginTop: -4 }}>
              Set organisation defaults. Nurseries can override on the Nursery
              tab.
            </div>

            {/* Three-up grid: Private, Additional, (Funding LA) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Private hourly rate (£)
                </span>
                <input
                  style={inputCss}
                  inputMode="decimal"
                  placeholder="e.g. 7.50 or .50"
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Additional hourly rate (£)
                </span>
                <input
                  style={inputCss}
                  inputMode="decimal"
                  placeholder="e.g. 1.50 or .50"
                  value={addlStr}
                  onChange={(e) => setAddlStr(e.target.value)}
                />
              </label>

              {/* (Funding hourly rate (LA) removed) */}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Stretched weeks
                </span>
                <input
                  type="number"
                  min={38}
                  max={51}
                  step={1}
                  style={inputCss}
                  value={
                    orgDefaults?.stretched_weeks ?? effective.stretched_weeks
                  }
                  onChange={(e) =>
                    setOrgDefaults((prev) =>
                      prev
                        ? {
                            ...prev,
                            stretched_weeks:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : prev
                    )
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Financial year end
                </span>
                <input
                  type="date"
                  style={inputCss}
                  value={
                    orgDefaults?.financial_year_end ??
                    effective.financial_year_end ??
                    ""
                  }
                  onChange={(e) =>
                    setOrgDefaults((prev) =>
                      prev
                        ? {
                            ...prev,
                            financial_year_end: e.target.value || null,
                          }
                        : prev
                    )
                  }
                />
              </label>

              <div />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Annual funded cap (15h)
                </span>
                <input
                  style={inputCss}
                  type="number"
                  min={0}
                  value={orgDefaults?.annual_cap_15 ?? effective.annual_cap_15}
                  onChange={(e) =>
                    setOrgDefaults((prev) =>
                      prev
                        ? {
                            ...prev,
                            annual_cap_15: parseMoneyLoose(e.target.value),
                          }
                        : prev
                    )
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Annual funded cap (30h)
                </span>
                <input
                  style={inputCss}
                  type="number"
                  min={0}
                  value={orgDefaults?.annual_cap_30 ?? effective.annual_cap_30}
                  onChange={(e) =>
                    setOrgDefaults((prev) =>
                      prev
                        ? {
                            ...prev,
                            annual_cap_30: parseMoneyLoose(e.target.value),
                          }
                        : prev
                    )
                  }
                />
              </label>

              <div />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 2fr",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>Invoice mode</div>
              <select
                style={inputCss}
                value={
                  (orgDefaults?.invoice_mode as InvoiceMode | null) ??
                  effective.invoice_mode
                }
                onChange={(e) =>
                  setOrgDefaults((prev) =>
                    prev
                      ? {
                          ...prev,
                          invoice_mode: e.target.value as InvoiceMode,
                        }
                      : prev
                  )
                }
              >
                <option value="monthly">Monthly</option>
                <option value="termly">Termly</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={saveOrganisation}
                style={btn}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...subtle, marginTop: -4 }}>
              Where the <b>nursery input</b> has no value, the{" "}
              <b>Organisation value</b> will be used.
            </div>

            {/* Headings */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                gap: 12,
                fontSize: 12,
                fontWeight: 700,
                color: "#6C7A89",
              }}
            >
              <div />
              <div>Organisation</div>
              <div>Nursery</div>
            </div>

            {/* Private hourly rate */}
            <RowCompare
              label="Private hourly rate (£)"
              orgRender={() => (
                <input
                  style={{ ...inputCss, background: "#F8F8F8" }}
                  value={toStr(
                    orgDefaults?.hourly_rate ?? effective?.hourly_rate ?? null
                  )}
                  readOnly
                />
              )}
              nurRender={() => (
                <input
                  style={inputCss}
                  inputMode="decimal"
                  placeholder="— inherit —"
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                />
              )}
            />

            {/* Additional hourly */}
            <RowCompare
              label="Additional hourly rate (£)"
              orgRender={() => (
                <input
                  style={{ ...inputCss, background: "#F8F8F8" }}
                  value={toStr(
                    orgDefaults?.additional_hourly_rate ??
                      effective?.additional_hourly_rate ??
                      null
                  )}
                  readOnly
                />
              )}
              nurRender={() => (
                <input
                  style={inputCss}
                  inputMode="decimal"
                  placeholder="— inherit —"
                  value={addlStr}
                  onChange={(e) => setAddlStr(e.target.value)}
                />
              )}
            />

            {/* Stretched weeks */}
            <RowCompare
              label="Stretched weeks"
              orgRender={() => (
                <input
                  style={{ ...inputCss, background: "#F8F8F8" }}
                  value={toStr(
                    orgDefaults?.stretched_weeks ??
                      effective?.stretched_weeks ??
                      null
                  )}
                  readOnly
                />
              )}
              nurRender={() => (
                <input
                  style={inputCss}
                  type="number"
                  min={38}
                  max={51}
                  step={1}
                  placeholder="— inherit —"
                  value={toStr(nurseryOverrides?.stretched_weeks ?? null)}
                  onChange={(e) =>
                    setNurseryField(
                      "stretched_weeks",
                      e.target.value === ""
                        ? null
                        : Number(e.target.value)
                    )
                  }
                />
              )}
            />

            {/* Financial year end */}
            <RowCompare
              label="Financial year end"
              orgRender={() => (
                <input
                  style={{ ...inputCss, background: "#F8F8F8" }}
                  value={
                    orgDefaults?.financial_year_end ??
                    effective?.financial_year_end ??
                    ""
                  }
                  readOnly
                />
              )}
              nurRender={() => (
                <input
                  style={inputCss}
                  type="date"
                  value={nurseryOverrides?.financial_year_end ?? ""}
                  onChange={(e) =>
                    setNurseryField(
                      "financial_year_end",
                      e.target.value || null
                    )
                  }
                />
              )}
            />

            {/* Annual caps */}
            <RowCompare
              label="Annual funded caps (hours)"
              orgRender={() => (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <input
                    style={{ ...inputCss, background: "#F8F8F8" }}
                    value={toStr(
                      orgDefaults?.annual_cap_15 ??
                        effective?.annual_cap_15 ??
                        null
                    )}
                    readOnly
                  />
                  <input
                    style={{ ...inputCss, background: "#F8F8F8" }}
                    value={toStr(
                      orgDefaults?.annual_cap_30 ??
                        effective?.annual_cap_30 ??
                        null
                    )}
                    readOnly
                  />
                </div>
              )}
              nurRender={() => (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <input
                    style={inputCss}
                    type="number"
                    placeholder="— inherit —"
                    value={toStr(nurseryOverrides?.annual_cap_15 ?? null)}
                    onChange={(e) =>
                      setNurseryField(
                        "annual_cap_15",
                        e.target.value === ""
                          ? null
                          : parseMoneyLoose(e.target.value)
                      )
                    }
                  />
                  <input
                    style={inputCss}
                    type="number"
                    placeholder="— inherit —"
                    value={toStr(nurseryOverrides?.annual_cap_30 ?? null)}
                    onChange={(e) =>
                      setNurseryField(
                        "annual_cap_30",
                        e.target.value === ""
                          ? null
                          : parseMoneyLoose(e.target.value)
                      )
                    }
                  />
                </div>
              )}
            />

            {/* Declarations section (nursery-level) */}
            <div
              style={{
                marginTop: 8,
                borderTop: "1px solid #EEE",
                paddingTop: 8,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Declarations
              </div>
              <div style={{ ...subtle, marginBottom: 8 }}>
                Configure how often parents need to sign funding declarations and
                how far in advance they are generated for each term. You can
                also override the standard wording for this nursery or local
                authority.
              </div>

              {(() => {
                const effectiveDeclMode =
                  (nurseryOverrides?.declaration_mode as
                    | DeclarationMode
                    | null) ??
                  (effective?.declaration_mode as DeclarationMode | null) ??
                  "termly";

                const effectiveLeadDays =
                  nurseryOverrides?.declaration_lead_days ??
                  effective?.declaration_lead_days ??
                  28;

                return (
                  <>
                    {/* Frequency */}
                    <div style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Declaration frequency
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="radio"
                            name="declaration_mode"
                            value="one_off"
                            checked={effectiveDeclMode === "one_off"}
                            onChange={() =>
                              setNurseryField("declaration_mode", "one_off")
                            }
                          />
                          <span>
                            One-off when the child first becomes funded
                          </span>
                        </label>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="radio"
                            name="declaration_mode"
                            value="termly"
                            checked={effectiveDeclMode === "termly"}
                            onChange={() =>
                              setNurseryField("declaration_mode", "termly")
                            }
                          />
                          <span>Every term (re-signed each term)</span>
                        </label>
                      </div>
                    </div>

                    {/* Lead days */}
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Generate termly declarations this many days before
                          term starts
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#6C7A89",
                          }}
                        >
                          (Only used when declarations are every term)
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <input
                          type="number"
                          min={7}
                          max={90}
                          style={{
                            ...inputCss,
                            width: 80,
                            background:
                              effectiveDeclMode !== "termly"
                                ? "#F8F8F8"
                                : "#FFF",
                          }}
                          value={toStr(effectiveLeadDays)}
                          onChange={(e) =>
                            setNurseryField(
                              "declaration_lead_days",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value)
                            )
                          }
                          disabled={effectiveDeclMode !== "termly"}
                        />
                        <span style={{ fontSize: 12, color: "#24364B" }}>
                          days before term start
                        </span>
                      </div>
                    </div>

                    {/* Intro text */}
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Declaration intro (optional)
                      </div>
                      <div style={{ ...subtle, marginBottom: 4 }}>
                        This text appears at the top of the declaration,
                        explaining the funding and how the form is used. If left
                        blank, a generic explanation will be shown.
                      </div>
                      <textarea
                        rows={3}
                        style={{
                          ...inputCss,
                          width: "100%",
                          resize: "vertical",
                        }}
                        value={nurseryOverrides?.declaration_intro_text ?? ""}
                        onChange={(e) =>
                          setNurseryField(
                            "declaration_intro_text",
                            e.target.value || null
                          )
                        }
                      />
                    </div>

                    {/* Reconfirm text */}
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        30-hours / reconfirmation text (optional)
                      </div>
                      <div style={{ ...subtle, marginBottom: 4 }}>
                        Text explaining HMRC reconfirmation (for 30 hours /
                        AENA). If left blank, a standard reconfirmation
                        paragraph will be used.
                      </div>
                      <textarea
                        rows={3}
                        style={{
                          ...inputCss,
                          width: "100%",
                          resize: "vertical",
                        }}
                        value={
                          nurseryOverrides?.declaration_reconfirm_text ?? ""
                        }
                        onChange={(e) =>
                          setNurseryField(
                            "declaration_reconfirm_text",
                            e.target.value || null
                          )
                        }
                      />
                    </div>

                    {/* Privacy text */}
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Data-sharing / privacy wording (optional)
                      </div>
                      <div style={{ ...subtle, marginBottom: 4 }}>
                        LA or nursery-specific wording about how information is
                        shared and stored. If left blank, a generic privacy
                        paragraph will be shown.
                      </div>
                      <textarea
                        rows={3}
                        style={{
                          ...inputCss,
                          width: "100%",
                          resize: "vertical",
                        }}
                        value={nurseryOverrides?.declaration_privacy_text ?? ""}
                        onChange={(e) =>
                          setNurseryField(
                            "declaration_privacy_text",
                            e.target.value || null
                          )
                        }
                      />
                    </div>

                    {/* Privacy URL */}
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Link to privacy / fair processing notice (optional)
                      </div>
                      <div style={{ ...subtle, marginBottom: 4 }}>
                        If provided, this URL will be shown underneath the
                        declaration so parents can read the full notice.
                      </div>
                      <input
                        type="url"
                        style={inputCss}
                        placeholder="https://example.gov.uk/privacy"
                        value={nurseryOverrides?.declaration_privacy_url ?? ""}
                        onChange={(e) =>
                          setNurseryField(
                            "declaration_privacy_url",
                            e.target.value || null
                          )
                        }
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Save button (nursery) */}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                onClick={saveNursery}
                style={btn}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Consumables card */}
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Consumables</div>
        <div style={{ ...subtle, marginTop: -4 }}>
          Attach fixed amounts for funded children (15h / 30h). Private-only
          children won’t receive funded consumables.
        </div>

        {/* Add bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr auto",
            gap: 8,
          }}
        >
          <input
            style={inputCss}
            placeholder="Description (e.g. Meals)"
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
          />
          <input
            style={inputCss}
            inputMode="decimal"
            placeholder="£ for 15h"
            value={add15}
            onChange={(e) => setAdd15(e.target.value)}
          />
          <input
            style={inputCss}
            inputMode="decimal"
            placeholder="£ for 30h"
            value={add30}
            onChange={(e) => setAdd30(e.target.value)}
          />
          <button style={btn} onClick={addConsumable} type="button">
            Add
          </button>
        </div>

        {/* Table */}
        {consLoading ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead style={{ background: "#FAFAFA" }}>
                <tr>
                  <Th>Description</Th>
                  <Th>Org 15h</Th>
                  <Th>Org 30h</Th>
                  <Th>Nursery 15h</Th>
                  <Th>Nursery 30h</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {consRows.length === 0 ? (
                  <tr>
                    <Td colSpan={6} style={{ color: "#666" }}>
                      No consumables yet.
                    </Td>
                  </tr>
                ) : (
                  consRows.map((r) => (
                    <tr
                      key={r.description}
                      style={{ borderTop: "1px solid #F3F3F3" }}
                    >
                      <Td>{r.description}</Td>
                      <Td>£{toStr(r.org15)}</Td>
                      <Td>£{toStr(r.org30)}</Td>
                      <Td>
                        {r.nur15 == null ? "—" : `£${toStr(r.nur15)}`}
                      </Td>
                      <Td>
                        {r.nur30 == null ? "—" : `£${toStr(r.nur30)}`}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <button
                          style={btnGhost}
                          type="button"
                          onClick={() => deleteConsumable(r.description)}
                        >
                          Remove
                        </button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- small table helpers ---------- */
function Th({ children, style }: any) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderBottom: "1px solid #EEE",
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, style, colSpan }: any) {
  return (
    <td style={{ padding: "10px 12px", ...style }} colSpan={colSpan}>
      {children}
    </td>
  );
}
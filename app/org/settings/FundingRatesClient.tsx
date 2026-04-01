"use client";

import React, { useEffect, useMemo, useState } from "react";

/** —— Types —— */
type Entitlement = {
  id: string;
  name: string;
  code: string | null;
  hours_per_week: number | null;
  is_active: boolean | null;
};

type RateRow = {
  id?: string | number;
  entitlement_id: string;
  rate_hour: number | null;
};

type Props = {
  orgId: string;
  orgName: string;
  nurseries: Array<{ id: string; name: string }>;
};

/** —— Styles (match Settings) —— */
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

/** —— Utils —— */
const toStr = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "" : String(n);
function parseMoneyLoose(v: string): number {
  const t = (v || "").trim().replace(/[£,\s]/g, "");
  if (!t) return 0;
  const s = t.startsWith(".") ? `0${t}` : t;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function FundingRatesClient({ orgId, orgName, nurseries }: Props) {
  /** This panel NO LONGER renders its own scope switcher or nursery selector.
   *  It listens to SettingsClient via a window CustomEvent: "org-settings-scope"
   *  detail: { mode: "organisation"|"nursery", nurseryId: string|null }
   */
  const [mode, setMode] = useState<"organisation" | "nursery">("organisation");
  const [nurseryId, setNurseryId] = useState<string | null>(nurseries[0]?.id ?? null);

  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [ents, setEnts] = useState<Entitlement[]>([]);
  const [orgRates, setOrgRates] = useState<Record<string, RateRow>>({});
  const [nurRates, setNurRates] = useState<Record<string, RateRow>>({});

  const selectedNurseryName = useMemo(
    () => nurseries.find((n) => n.id === nurseryId)?.name ?? "",
    [nurseries, nurseryId]
  );

  /** ——— Listen for Settings scope changes ——— */
  useEffect(() => {
    const handler = (e: Event) => {
      const det = (e as CustomEvent).detail || {};
      const nextMode = (det.mode as "organisation" | "nursery") || "organisation";
      const nextNurseryId = (det.nurseryId as string | null) ?? null;
      setMode(nextMode);
      setNurseryId(nextNurseryId);
    };
    window.addEventListener("org-settings-scope", handler as EventListener);
    return () => window.removeEventListener("org-settings-scope", handler as EventListener);
  }, []);

  /** Load entitlements once */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/funding-rates/entitlements", {
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to load entitlements");
        if (!cancelled) setEnts((j.items ?? []) as Entitlement[]);
      } catch (e: any) {
        setBanner(e?.message || "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Load rates whenever scope changes */
  async function loadRates(currMode = mode, currNurseryId = nurseryId) {
    setLoading(true);
    setBanner(null);
    try {
      // ORG rates
      const orgRes = await fetch(
        `/api/funding-rates?scope=org&orgId=${encodeURIComponent(orgId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const orgJson = await orgRes.json();
      if (!orgRes.ok) throw new Error(orgJson?.error || "Failed to load org rates");
      const orgMap: Record<string, RateRow> = {};
      for (const r of orgJson.items ?? []) orgMap[r.entitlement_id] = r;

      // Nursery rates only if needed and nursery selected
      let nurMap: Record<string, RateRow> = {};
      if (currMode === "nursery" && currNurseryId) {
        const nurRes = await fetch(
          `/api/funding-rates?scope=nursery&nurseryId=${encodeURIComponent(
            currNurseryId
          )}`,
          { cache: "no-store", credentials: "include" }
        );
        const nurJson = await nurRes.json();
        if (!nurRes.ok) throw new Error(nurJson?.error || "Failed to load nursery rates");
        for (const r of nurJson.items ?? []) nurMap[r.entitlement_id] = r;
      }

      setOrgRates(orgMap);
      setNurRates(nurMap);
    } catch (e: any) {
      setBanner(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // refetch on scope change
    loadRates().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nurseryId]);

  async function saveOrg(entitlementId: string, value: string) {
    const rate = value.trim() === "" ? null : parseMoneyLoose(value);
    setBanner(null);
    try {
      const res = await fetch("/api/funding-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          scope: "org",
          org_id: orgId,
          entitlement_id: entitlementId,
          rate_hour: rate,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Save failed");
      await loadRates();
      setBanner("Saved.");
    } catch (e: any) {
      setBanner(e?.message || "Save failed");
    }
  }

  async function saveNursery(entitlementId: string, value: string) {
    if (!nurseryId) return;
    const rate = value.trim() === "" ? null : parseMoneyLoose(value);
    setBanner(null);
    try {
      const res = await fetch("/api/funding-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          scope: "nursery",
          nursery_id: nurseryId,
          entitlement_id: entitlementId,
          rate_hour: rate,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Save failed");
      await loadRates();
      setBanner("Saved.");
    } catch (e: any) {
      setBanner(e?.message || "Save failed");
    }
  }

  async function clearNursery(entitlementId: string) {
    const row = nurRates[entitlementId];
    if (!row?.id) {
      setNurRates((m) => ({ ...m, [entitlementId]: { entitlement_id: entitlementId, rate_hour: null } }));
      return;
    }
    setBanner(null);
    try {
      const res = await fetch("/api/funding-rates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ id: row.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Delete failed");
      await loadRates();
      setBanner("Removed.");
    } catch (e: any) {
      setBanner(e?.message || "Delete failed");
    }
  }

  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Funding Hourly Rates</span>
        <span style={subtle}>
          {mode === "organisation"
            ? `Organisation: ${orgName || "—"}`
            : `Nursery: ${selectedNurseryName || "—"}`}
        </span>
      </div>

      {mode === "nursery" && !nurseryId && (
        <div
          style={{
            background: "#FFF8E6",
            border: "1px solid #F2D27A",
            color: "#6A4A0C",
            padding: 10,
            borderRadius: 8,
          }}
        >
          Select a nursery in the Settings header to edit overrides.
        </div>
      )}

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

      <div style={{ ...subtle, marginTop: -4 }}>
        {mode === "organisation"
          ? <>Set organisation-wide hourly funding rates per entitlement. Nurseries can override on the Nursery scope.</>
          : <>Where a nursery rate is blank, the organisation rate applies.</>}
      </div>

      {loading ? (
        <div style={{ opacity: 0.7 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead style={{ background: "#FAFAFA" }}>
              <tr>
                <Th style={{ minWidth: 230 }}>Entitlement</Th>
                <Th style={{ width: 120 }}>Code</Th>
                <Th style={{ width: 120 }}>Hours/wk</Th>
                {mode === "organisation" ? (
                  <>
                    <Th style={{ width: 180 }}>Org rate (£/hr)</Th>
                    <Th style={{ width: 120 }} />
                  </>
                ) : (
                  <>
                    <Th style={{ width: 180 }}>Org rate (£/hr)</Th>
                    <Th style={{ width: 180 }}>Nursery rate (£/hr)</Th>
                    <Th style={{ width: 160 }} />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {ents.length === 0 ? (
                <tr>
                  <Td colSpan={6} style={{ color: "#666" }}>
                    No entitlements found.
                  </Td>
                </tr>
              ) : (
                ents
                  .filter((e) => e.is_active !== false)
                  .map((e) => {
                    const org = orgRates[e.id]?.rate_hour ?? null;
                    const nur = nurRates[e.id]?.rate_hour ?? null;
                    return (
                      <tr key={e.id} style={{ borderTop: "1px solid #F3F3F3" }}>
                        <Td><b>{e.name}</b></Td>
                        <Td>{e.code ?? "—"}</Td>
                        <Td>{e.hours_per_week ?? "—"}</Td>

                        {mode === "organisation" ? (
                          <>
                            <Td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>£</span>
                                <input
                                  style={{ ...inputCss, width: "100%" }}
                                  inputMode="decimal"
                                  defaultValue={toStr(org)}
                                  onBlur={(ev) => saveOrg(e.id, ev.currentTarget.value)}
                                />
                              </div>
                            </Td>
                            <Td />
                          </>
                        ) : (
                          <>
                            <Td>
                              <input
                                style={{ ...inputCss, background: "#F8F8F8" }}
                                readOnly
                                value={toStr(org)}
                                placeholder="—"
                              />
                            </Td>
                            <Td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>£</span>
                                <input
                                  style={{ ...inputCss, width: "100%" }}
                                  inputMode="decimal"
                                  defaultValue={toStr(nur)}
                                  onBlur={(ev) => saveNursery(e.id, ev.currentTarget.value)}
                                  placeholder="— inherit —"
                                />
                              </div>
                            </Td>
                            <Td style={{ textAlign: "right" }}>
                              <button
                                style={btnGhost}
                                type="button"
                                onClick={() => clearNursery(e.id)}
                                disabled={!nurseryId}
                              >
                                {nurRates[e.id]?.id ? "Remove override" : "Clear"}
                              </button>
                            </Td>
                          </>
                        )}
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

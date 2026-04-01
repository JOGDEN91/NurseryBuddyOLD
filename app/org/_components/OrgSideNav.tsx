"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SignOutButton from "@/components/SignOutButton";
import { useScope } from "@/components/scope/ScopeProvider";
import MessageIconButton from "@/components/messaging/MessageIconButton";

type NavItem = { href: string; label: string };

type TermOption = {
  id: string;
  label: string;
  start_date?: string | null;
  end_date?: string | null;
};

type SeasonOption = {
  id: string; // anchor LA term_id (earliest block in season)
  label: string; // e.g. "Autumn 2025/26"
  start_date: string | null;
  end_date: string | null;
};

function normISO(s?: string | null): string | null {
  if (!s) return null;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}

function parseSeasonFromLabel(label: string | null | undefined): "Autumn" | "Spring" | "Summer" | null {
  const t = String(label ?? "").trim();
  if (!t) return null;

  const m = t.match(/\((autumn|spring|summer)\)/i);
  if (m?.[1]) {
    const s = m[1].toLowerCase();
    return s === "autumn" ? "Autumn" : s === "spring" ? "Spring" : "Summer";
  }

  // fallback if labels ever change
  if (/autumn/i.test(t)) return "Autumn";
  if (/spring/i.test(t)) return "Spring";
  if (/summer/i.test(t)) return "Summer";
  return null;
}

// Academic year: Sep–Aug => YYYY/YY
function academicYearFromStartDate(startIso: string | null): string | null {
  const s = normISO(startIso);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan
  const startYear = month >= 8 ? year : year - 1;
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}/${endYY}`;
}

function toMs(iso: string | null | undefined): number | null {
  const s = normISO(iso ?? null);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export default function OrgSideNav({
  logoSrc = "/nursery-buddy-logo.png",
  width = 220,
  logoWidth = 160,
  logoHeight = 56,
  sidebarColor = "#24364B",
  activeColor = "#4CAF78",
  sliderActive = "#F08A00",
  nurseries,
  orgNav,
  nurseryNav,
}: {
  logoSrc?: string;
  width?: number;
  logoWidth?: number;
  logoHeight?: number;
  sidebarColor?: string;
  activeColor?: string;
  sliderActive?: string;
  nurseries: { id: string; name: string }[];
  orgNav: NavItem[];
  nurseryNav: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, setMode, nurseryId, setNurseryId } = useScope();

  const termId = searchParams.get("term_id") ?? "";

  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);

  const items = mode === "org" ? orgNav : nurseryNav;

  // Keep slider in sync with URL
  useEffect(() => {
    const isNurserySection =
      /^\/org\/(nursery|funding|declarations|requests|documents|children|messages)(\/|$)/i.test(pathname ?? "");
    const desired: "org" | "nursery" = isNurserySection ? "nursery" : "org";
    if (mode !== desired) setMode(desired);
  }, [pathname, mode, setMode]);

  // Persist nurseryId in cookie for server components
  useEffect(() => {
    if (!nurseryId) return;
    document.cookie = `nb.nurseryId=${encodeURIComponent(nurseryId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [nurseryId]);

  // Load LA block terms for the current nursery (works in org + nursery modes)
  useEffect(() => {
    if (!nurseryId) {
      setTerms([]);
      return;
    }

    let cancelled = false;

    async function loadTerms() {
      setTermsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);

        const res = await fetch(`/api/org/declarations?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;

        if (res.ok && j?.ok !== false && Array.isArray(j.terms)) {
          setTerms(j.terms as TermOption[]);
        } else {
          setTerms([]);
        }
      } catch {
        if (!cancelled) setTerms([]);
      } finally {
        if (!cancelled) setTermsLoading(false);
      }
    }

    loadTerms();
    return () => {
      cancelled = true;
    };
  }, [nurseryId]);

  /**
   * Derive canonical seasonal options (Autumn/Spring/Summer + academic year) from LA blocks.
   * - term_id anchor is the earliest-start LA block within that season.
   * - this prevents the UI from showing Term 1/2/3.
   */
  const derived = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        minStart: string | null;
        maxEnd: string | null;
        anchorId: string;
        anchorStartMs: number;
        memberIds: Set<string>;
      }
    >();

    for (const t of terms) {
      const season = parseSeasonFromLabel(t.label);
      const startIso = normISO(t.start_date ?? null);
      const endIso = normISO(t.end_date ?? null);
      const ay = academicYearFromStartDate(startIso);

      if (!season || !ay) continue;

      const key = `${season} ${ay}`;
      const startMs = toMs(startIso) ?? Number.POSITIVE_INFINITY;

      const g = groups.get(key);
      if (!g) {
        groups.set(key, {
          label: key,
          minStart: startIso,
          maxEnd: endIso,
          anchorId: t.id,
          anchorStartMs: startMs,
          memberIds: new Set([t.id]),
        });
      } else {
        g.memberIds.add(t.id);

        if (startIso && (!g.minStart || new Date(startIso) < new Date(g.minStart))) g.minStart = startIso;
        if (endIso && (!g.maxEnd || new Date(endIso) > new Date(g.maxEnd))) g.maxEnd = endIso;

        if (startMs < g.anchorStartMs) {
          g.anchorStartMs = startMs;
          g.anchorId = t.id;
        }
      }
    }

    const options: SeasonOption[] = Array.from(groups.values())
      .map((g) => ({
        id: g.anchorId,
        label: g.label,
        start_date: g.minStart ?? null,
        end_date: g.maxEnd ?? null,
      }))
      .sort((a, b) => (toMs(a.start_date) ?? 0) - (toMs(b.start_date) ?? 0));

    const rawToAnchor = new Map<string, string>();
    for (const g of groups.values()) {
      for (const id of g.memberIds) rawToAnchor.set(id, g.anchorId);
    }

    return { options, rawToAnchor };
  }, [terms]);

  const termOptions = derived.options;

  const handleTermChange = (nextId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("term_id", nextId);
    else params.delete("term_id");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);

    // Persist last selected term per nursery
    if (typeof window !== "undefined" && nurseryId && nextId) {
      try {
        window.localStorage.setItem(`nb.orgTerm.${nurseryId}`, nextId);
      } catch {
        // ignore
      }
    }
  };

  // Pick a sensible initial term when term_id is missing/invalid (seasonal options)
  useEffect(() => {
    if (!nurseryId || termOptions.length === 0) return;
    if (typeof window === "undefined") return;

    const storageKey = `nb.orgTerm.${nurseryId}`;

    // If URL has a term_id:
    // - If it is already a season anchor, persist it
    // - If it is a raw block id, remap it to the season anchor
    if (termId) {
      const isAnchor = termOptions.some((t) => t.id === termId);
      if (isAnchor) {
        try {
          window.localStorage.setItem(storageKey, termId);
        } catch {}
        return;
      }

      const remapped = derived.rawToAnchor.get(termId) ?? null;
      if (remapped && termOptions.some((t) => t.id === remapped)) {
        handleTermChange(remapped);
        return;
      }
    }

    // If URL term is missing/invalid, try saved term
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && termOptions.some((t) => t.id === saved)) {
        handleTermChange(saved);
        return;
      }
    } catch {
      // ignore
    }

    // Else pick current season by today's date, else nearest future, else latest past
    const today = Date.now();

    const within = termOptions.filter((t) => {
      const s = toMs(t.start_date);
      const e = toMs(t.end_date);
      if (s == null || e == null) return false;
      return s <= today && today <= e;
    });

    const byStartAsc = (a: SeasonOption, b: SeasonOption) => (toMs(a.start_date) ?? 0) - (toMs(b.start_date) ?? 0);

    let chosen: SeasonOption | null = null;

    if (within.length > 0) {
      within.sort(byStartAsc);
      chosen = within[0];
    } else {
      const future = termOptions.filter((t) => {
        const s = toMs(t.start_date);
        return s != null && s > today;
      });
      const past = termOptions.filter((t) => {
        const s = toMs(t.start_date);
        return s != null && s <= today;
      });

      if (future.length > 0) {
        future.sort(byStartAsc);
        chosen = future[0];
      } else if (past.length > 0) {
        past.sort(byStartAsc);
        chosen = past[past.length - 1];
      } else {
        chosen = termOptions[0];
      }
    }

    if (chosen) handleTermChange(chosen.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId, termOptions, termId]);

  // Load unread total for the envelope icon (uses current nurseryId)
  useEffect(() => {
    if (!nurseryId) {
      setUnreadTotal(0);
      return;
    }

    let cancelled = false;

    async function loadUnread() {
      try {
        const params = new URLSearchParams();
        params.set("nursery_id", nurseryId);
        const res = await fetch(`/api/org/messages/unread-count?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;

        if (res.ok && j.ok !== false && typeof j.total === "number") {
          setUnreadTotal(j.total);
        } else {
          setUnreadTotal(0);
        }
      } catch {
        if (!cancelled) setUnreadTotal(0);
      }
    }

    loadUnread();
    return () => {
      cancelled = true;
    };
  }, [nurseryId]);

  // Defensive: never navigate to an undefined href
  const goGroup = (target: "org" | "nursery") => {
    setMode(target);

    const list = target === "org" ? orgNav : nurseryNav;
    const firstHref = list?.find((x) => typeof x?.href === "string" && x.href.length > 0)?.href;
    if (!firstHref) return;

    const hrefWithTerm = termId ? `${firstHref}?term_id=${encodeURIComponent(termId)}` : firstHref;

    if (!(pathname ?? "").startsWith(firstHref)) {
      router.push(hrefWithTerm);
    }
  };

  // For nav links, use the URL term_id as-is (it should already be the season anchor).
  const effectiveTermId = termId;

  return (
    <aside
      style={{
        width,
        background: sidebarColor,
        color: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 12,

        // --- Layout constraints only ---
        position: "sticky",
        top: 0,
        height: "100dvh",
        alignSelf: "flex-start",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ display: "grid", justifyItems: "center", paddingBottom: 6 }}>
        <Image src={logoSrc} width={logoWidth} height={logoHeight} alt="Nursery Buddy" style={{ objectFit: "contain" }} priority />
      </div>

      {/* Organisation | Nursery toggle */}
      <div
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 999,
          padding: 4,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={() => goGroup("org")}
          style={{
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            border: "1px solid transparent",
            background: mode === "org" ? sliderActive : "transparent",
            color: mode === "org" ? "#fff" : "rgba(255,255,255,0.9)",
          }}
        >
          Organisation
        </button>
        <button
          type="button"
          onClick={() => goGroup("nursery")}
          style={{
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            border: "1px solid transparent",
            background: mode === "nursery" ? sliderActive : "transparent",
            color: mode === "nursery" ? "#fff" : "rgba(255,255,255,0.9)",
          }}
        >
          Nursery
        </button>
      </div>

      {/* Nursery selector (nursery mode only) */}
      {mode === "nursery" && (
        <div style={{ display: "grid", justifyItems: "center" }}>
          <select
            value={nurseryId ?? ""}
            onChange={(e) => setNurseryId(e.target.value || null)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              appearance: "none",
              textAlign: "left",
            }}
          >
            {nurseries.map((n) => (
              <option key={n.id} value={n.id} style={{ color: "#000" }}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Term selector (always visible) - seasonal options */}
      <div style={{ display: "grid", justifyItems: "center" }}>
        <select
          value={effectiveTermId}
          onChange={(e) => handleTermChange(e.target.value)}
          disabled={!nurseryId || termOptions.length === 0}
          style={{
            width: "100%",
            padding: "6px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.04)",
            color: "#fff",
            appearance: "none",
            textAlign: "left",
            fontSize: 12,
            opacity: !nurseryId || termOptions.length === 0 ? 0.6 : 1,
          }}
        >
          {termsLoading && (
            <option value="" style={{ color: "#000" }}>
              Loading terms…
            </option>
          )}

          {!termsLoading && termOptions.length === 0 && (
            <option value="" style={{ color: "#000" }}>
              No terms
            </option>
          )}

          {termOptions.map((t) => (
            <option key={t.id} value={t.id} style={{ color: "#000" }}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Scroll container for nav (footer stays pinned) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {items
            .filter((item) => typeof item?.href === "string" && item.href.length > 0)
            .map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/account/profile" && (pathname ?? "").startsWith(item.href));

              const hrefWithTerm =
                effectiveTermId && item.href.startsWith("/org/")
                  ? `${item.href}?term_id=${encodeURIComponent(effectiveTermId)}`
                  : item.href;

              return (
                <Link
                  key={item.href}
                  href={hrefWithTerm}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    textDecoration: "none",
                    color: "#FFFFFF",
                    borderRadius: 6,
                    position: "relative",
                    background: active ? activeColor : "transparent",
                  }}
                >
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 6,
                        bottom: 6,
                        width: 3,
                        borderRadius: 2,
                        background: "#FFFFFF",
                      }}
                    />
                  )}
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </div>

      {/* Footer: sign out left, messages icon right */}
      <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <SignOutButton variant="sidebar" />
          <MessageIconButton href="/org/messages" unreadCount={unreadTotal} size={28} />
        </div>
      </div>
    </aside>
  );
}
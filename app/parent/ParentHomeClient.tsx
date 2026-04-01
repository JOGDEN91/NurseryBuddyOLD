"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  bootstrap: {
    greetingName: string;
    badges: { docsRequired: number; invoicesDue: number; notifications: number };
  };
};

// Brand variables (fallbacks)
const ACCENT = "#24364B";
const TILE_BR = "var(--nb-tile-br, #EEEAF6)"; // light border
const GLOW = "var(--nb-accent-shadow, rgba(109,90,230,.25))"; // purple-ish glow

function Tile({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <Link href={href} style={{ position: "relative" }} aria-label={label}>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 22,
          border: `1px solid ${TILE_BR}`,
          boxShadow: `0 10px 28px ${GLOW}, 0 1px 0 rgba(17,19,32,.06)`,
          padding: 22,
          minHeight: 150,
          display: "grid",
          placeItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        {/* optional badge */}
        {badge ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              minWidth: 22,
              height: 22,
              padding: "0 6px",
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background: "#FFE9E3",
              color: "#C24A1D",
              border: "1px solid #FFD5C9",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {badge}
          </span>
        ) : null}

        {/* Icon (no inner card) */}
        <div style={{ lineHeight: 0 }}>{icon}</div>

        {/* Label */}
        <div style={{ fontWeight: 600, color: "#24364B" }}>{label}</div>
      </div>
    </Link>
  );
}

/* ----------- Icon set: large, centered, accent-tinted (no inner card) ----------- */
function IconProfile() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke={ACCENT} strokeWidth="1.8" />
      <path
        d="M4.8 20c2.2-3.9 12.2-3.9 14.4 0"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconFunding() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19h16" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M6 15l4-4 3 3 5-6"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="3.6" y="9.8" fontSize="10" fontWeight="700" fill={ACCENT}>
        £
      </text>
    </svg>
  );
}
function IconDocs() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.5 3H14l4 4v12.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V4.5A1.5 1.5 0 0 1 7.5 3Z"
        stroke={ACCENT}
        strokeWidth="1.8"
      />
      <path d="M14 3v4h4" stroke={ACCENT} strokeWidth="1.8" />
      <path d="M9 11h6M9 14h6" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconInvoices() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h8l3 3v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V4.5A1.5 1.5 0 0 1 7.5 3Z"
        stroke={ACCENT}
        strokeWidth="1.8"
      />
      <path d="M9 9h6M9 12h6M9 15h4" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <text
        x="15.5"
        y="18"
        fontSize="8"
        fontWeight="700"
        fill={ACCENT}
        textAnchor="middle"
      >
        £
      </text>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke={ACCENT} strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M4 9h16" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.2" fill={ACCENT} />
      <circle cx="12" cy="13" r="1.2" fill={ACCENT} />
      <circle cx="15" cy="13" r="1.2" fill={ACCENT} />
    </svg>
  );
}

export default function ParentHomeClient({ bootstrap }: Props) {
  const { greetingName, badges } = bootstrap;

  // Start with whatever the server gave us ("Parent" right now),
  // then refine it from /api/parent/profile when we can.
  const [displayName, setDisplayName] = useState(greetingName || "Parent");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/parent/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        const text = await res.text();
        if (!text) return;
        const data = JSON.parse(text) as {
          ok?: boolean;
          parent?: { full_name?: string | null };
        };

        if (!res.ok || data.ok === false) return;

        const fullName =
          (data.parent?.full_name ?? "").toString().trim() ||
          (greetingName || "").trim();

        if (!fullName || cancelled) return;

        const first = fullName.split(/\s+/)[0] || "Parent";
        setDisplayName(first);
      } catch {
        // swallow – keep existing greetingName
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [greetingName]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Greeting */}
      <div
        style={{
          textAlign: "center",
          color: "rgba(255,255,255,.7)",
          fontSize: 20,
        }}
      >
        Hi, {displayName}!
      </div>

      {/* Responsive grid: 2 / 3 / 4 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .nb-grid{ display:grid; gap:14px; grid-template-columns:repeat(2,minmax(0,1fr)); }
          @media(min-width:640px){ .nb-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
          @media(min-width:1024px){ .nb-grid{ grid-template-columns:repeat(4,minmax(0,1fr)); } }
        `,
        }}
      />

      <div className="nb-grid">
        <Tile href="/parent/profile" label="My Profile" icon={<IconProfile />} />
        <Tile href="/parent/funding" label="Funding" icon={<IconFunding />} />
        <Tile
          href="/parent/documents"
          label="Documents"
          icon={<IconDocs />}
          badge={badges.docsRequired ? String(badges.docsRequired) : undefined}
        />
        <Tile
          href="/parent/invoices"
          label="My Invoices"
          icon={<IconInvoices />}
          badge={badges.invoicesDue ? String(badges.invoicesDue) : undefined}
        />
        <Tile href="/parent/terms" label="Term Dates" icon={<IconCalendar />} />
      </div>
    </div>
  );
}

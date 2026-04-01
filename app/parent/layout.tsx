"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Detail views manage their own header (FixedBackHeader in Profile/Child pages)
  const isDetailPage =
    pathname.startsWith("/parent/profile") || pathname.startsWith("/parent/children/") || pathname.startsWith("/parent/documents") || pathname.startsWith("/parent/invoices") || pathname.startsWith("/parent/funding");

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#24364B", // unified parent background
        color: "#fff",
      }}
    >
      {!isDetailPage && <ParentMainHeader />}

      {/* Child pages (including ProfileClient & ChildClient) render inside here */}
      <main style={{ padding: 12 }}>{children}</main>
    </div>
  );
}

/**
 * Main parent header (cog + logo + bell) for the /parent dashboard
 * This is HIDDEN on /parent/profile and /parent/children/[id]
 */
function ParentMainHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        backgroundColor: "#24364B",
        padding: "12px 10px 6px",
        display: "grid",
        gridTemplateColumns: "44px 1fr 44px",
        alignItems: "center",
      }}
    >
      {/* Settings (cog) */}
      <Link
        href="/parent/settings"
        aria-label="Settings"
        style={{ display: "grid", placeItems: "center", height: 44, width: 44 }}
      >
        <CogIcon />
      </Link>

      {/* Centered logo / wordmark */}
      <div style={{ display: "grid", placeItems: "center" }}>
        <Image
          src="/nursery-buddy-icon.png"
          alt="Nursery Buddy"
          width={150}
          height={26}
          priority
          style={{
            height: 40,
            width: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      {/* Notifications (bell) */}
      <Link
        href="/parent/notifications"
        aria-label="Notifications"
        style={{ display: "grid", placeItems: "center", height: 44, width: 44 }}
      >
        <BellIcon />
      </Link>
    </header>
  );
}

/** Heroicons-style cog – clean, recognisable settings icon */
function CogIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <path
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.72 7.72 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.52 6.52 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.51 6.51 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.94 6.94 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Simple bell icon to match the cog */
function BellIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <path
        d="M6.75 10.5A5.25 5.25 0 0 1 12 5.25a5.25 5.25 0 0 1 5.25 5.25v3.1c0 .6.2 1.18.55 1.65l1.1 1.65c.2.27.03.65-.3.65H5.4c-.33 0-.5-.38-.3-.65l1.1-1.65c.35-.47.55-1.05.55-1.65v-3.1Z"
        stroke="#ffffff"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 18.75A2 2 0 0 0 12 20a2 2 0 0 0 2-1.25"
        stroke="#ffffff"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

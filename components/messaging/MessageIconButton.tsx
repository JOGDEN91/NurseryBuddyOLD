// components/messaging/MessageIconButton.tsx
"use client";

import Link from "next/link";

type Props = {
  href: string;          // e.g. "/org/messages"
  unreadCount?: number;  // show red dot when > 0
  size?: number;         // icon size in px (default 22)
};

export default function MessageIconButton({
  href,
  unreadCount = 0,
  size = 22,
}: Props) {
  const hasUnread = unreadCount > 0;

  return (
    <Link
      href={href}
      aria-label="Messages"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 12,
        height: size + 12,
        borderRadius: 999,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {/* Envelope / email icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        {/* Outer envelope */}
        <rect
          x="3.5"
          y="5"
          width="17"
          height="14"
          rx="2"
          ry="2"
          fill="none"
          stroke="#4CAF78"
          strokeWidth="1.8"
        />
        {/* Flap */}
        <path
          d="M5 7.5L12 12L19 7.5"
          fill="none"
          stroke="#4CAF78"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Inner folds (optional, subtle) */}
        <path
          d="M5 16.5L9.5 13.5M19 16.5L14.5 13.5"
          fill="none"
          stroke="#4CAF78"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      {/* Red dot / badge for unread */}
      {hasUnread && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 14,
            height: 14,
            borderRadius: 999,
            background: "#EF4444",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            paddingInline: 3,
            boxShadow: "0 0 0 1px #24364B", // outline so it pops on the dark sidebar
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
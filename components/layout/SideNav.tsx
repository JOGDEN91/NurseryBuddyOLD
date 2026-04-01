"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import SignOutButton from "../SignOutButton";

export type NavItem = { href: string; label: string };

export default function SideNav({
  logoSrc = "/nursery-buddy-logo.png",
  // brand text is now optional & hidden by default per your request
  title = "Nursery Buddy",
  showBrandText = false,
  headerText, // e.g. "STAFF" (uppercase) shown above the menu; omit for Parent
  navItems,
  sidebarColor = "#24364B",
  pageBg = "#FAF9F7",
  activeColor = "#4CAF78",
  width = 220,
  logoWidth = 160,
  logoHeight = 56,
  children,
}: {
  logoSrc?: string;
  title?: string;
  showBrandText?: boolean;
  headerText?: string;
  navItems: NavItem[];
  sidebarColor?: string;
  pageBg?: string;
  activeColor?: string;
  width?: number;
  logoWidth?: number;
  logoHeight?: number;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: pageBg }}>
      <aside
        style={{
          width,
          background: sidebarColor,
          color: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 12,
        }}
      >
        {/* Logo (bigger) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 6 }}>
          <Image
            src={logoSrc}
            width={logoWidth}
            height={logoHeight}
            alt={title}
            style={{ objectFit: "contain" }}
            priority
          />
          {showBrandText && (
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700 }}>{title}</div>
            </div>
          )}
        </div>

        {/* Optional header above menu (e.g., STAFF) */}
        {headerText && (
          <div
            style={{
              fontSize: 13,
              letterSpacing: 1.5,
              fontWeight: 800,
              opacity: 0.95,
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            {headerText}
          </div>
        )}

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/account/profile" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
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

        <div style={{ flex: 1 }} />

        {/* Sign out pinned at bottom */}
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <SignOutButton variant="sidebar" />
        </div>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

export default function StaffSidebar({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname() || "/";

  // normalize trailing slash (except root)
  const norm = (s: string) => (s !== "/" ? s.replace(/\/+$/, "") : s);

  return (
    <aside
      style={{
        background: "#24364B", // dark navy
        color: "white",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: "100vh",
      }}
    >
      {/* Brand */}
      <div style={{ display: "grid", gap: 6, alignItems: "center", justifyItems: "start" }}>
        <Image
          src="/nursery-buddy-logo.png"
          alt="Nursery Buddy"
          width={72}
          height={72}
          priority
          style={{ display: "block" }}
        />
        <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>Nursery Buddy</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Staff</div>

        {/* TEMP debug so we can SEE the path the client sees */}
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
          current: <code>{pathname}</code>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {nav.map((i) => {
          const active = norm(pathname) === norm(i.href) || norm(pathname).startsWith(norm(i.href) + "/");
          return (
            <Link key={i.href} href={i.href} style={{ textDecoration: "none" }}>
              <div
                aria-current={active ? "page" : undefined}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "background 120ms ease, color 120ms ease",
                  color: "white",
                  background: active ? "#4CAF78" : "transparent", // GREEN when active
                  boxShadow: active ? "inset 4px 0 0 0 rgba(255,255,255,0.95)" : "none", // left accent bar
                }}
              >
                {i.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* push footer to bottom */}
      <div style={{ flex: 1 }} />

      {/* We keep the sign-out button styling in its own component; layout passes it below */}
      <div id="sidebar-footer" />
    </aside>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

function normalize(path: string) {
  if (!path) return "/";
  // drop trailing slash (except for root)
  return path !== "/" ? path.replace(/\/+$/, "") : path;
}

export default function StaffNav({ items }: { items: Item[] }) {
  const pathname = normalize(usePathname());

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* DEBUG: shows what the client sees; remove after confirming */}
      <div style={{ fontSize: 11, opacity: 0.6 }}>Current: {pathname}</div>

      <nav style={{ display: "grid", gap: 6 }}>
        {items.map((i) => {
          const h = normalize(i.href);
          const active = pathname === h || pathname.startsWith(h + "/");
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
                  background: active ? "#4CAF78" : "transparent", // green when active
                  boxShadow: active ? "inset 3px 0 0 0 rgba(255,255,255,0.9)" : "none",
                }}
              >
                {i.label}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
"use client";

import { usePathname } from "next/navigation";
import { useScope } from "@/components/scope/ScopeProvider";

type NavItem = { href: string; label: string };

export default function DynamicOrgNav({
  orgNav,
  nurseryNav,
}: {
  orgNav: NavItem[];
  nurseryNav: NavItem[];
}) {
  const { mode } = useScope();
  const items = mode === "org" ? orgNav : nurseryNav;
  const pathname = usePathname();

  return (
    <nav style={{ padding: 8, display: "grid", gap: 4 }}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <a
            key={item.href}
            href={item.href}
            style={{
              display: "block",
              padding: "9px 12px",
              borderRadius: 8,
              textDecoration: "none",
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              color: active ? "#fff" : "#CFE1EE",
              fontWeight: active ? 700 : 500,
            }}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

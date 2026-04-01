// app/org/OrgClientShell.tsx
"use client";

import type { ReactNode } from "react";
import { ScopeProvider } from "@/components/scope/ScopeProvider";
import OrgSideNav from "./_components/OrgSideNav";
import { OrgMetaProvider } from "./_components/OrgMetaContext";

type NavItem = { href: string; label: string };

export default function OrgClientShell({
  orgName,
  nurseries,
  orgNav,
  nurseryNav,
  initialNurseryId,
  children,
}: {
  orgName: string;
  nurseries: { id: string; name: string }[];
  orgNav: NavItem[];
  nurseryNav: NavItem[];
  initialNurseryId: string | null;
  children: ReactNode;
}) {
  return (
    <ScopeProvider initialMode="org" initialNurseryId={initialNurseryId}>
      <OrgMetaProvider orgName={orgName} nurseries={nurseries}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            background: "#FAF9F7",
          }}
        >
          <OrgSideNav
            nurseries={nurseries}
            orgNav={orgNav}
            nurseryNav={nurseryNav}
          />
          <main style={{ flex: 1, padding: 24 }}>{children}</main>
        </div>
      </OrgMetaProvider>
    </ScopeProvider>
  );
}
// app/org/layout.tsx
import type { ReactNode } from "react";
import RequireOrgAdmin from "./(guards)/RequireOrgAdmin";
import SideNav, { NavItem } from "@/components/layout/SideNav";

const orgNav: NavItem[] = [
  { href: "/org/overview",  label: "Overview" },
  { href: "/org/funding",   label: "Funding" },
  { href: "/org/requests",  label: "Requests" },
  { href: "/org/documents", label: "Documents" },
  { href: "/org/children",  label: "Children" },
  { href: "/org/staff",     label: "Staff" },
  { href: "/org/finance",   label: "Finance" },
];

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <RequireOrgAdmin>
      <SideNav
        navItems={orgNav}
        sidebarColor="#24364B"
        pageBg="#FAF9F7"
        activeColor="#4CAF78"
        showBrandText={false}
        headerText="ORGANISATION"
        logoWidth={180}
        logoHeight={64}
        width={220}
      >
        {children}
      </SideNav>
    </RequireOrgAdmin>
  );
}

"use client";

import SideNav, { NavItem } from "../../components/layout/SideNav";

const staffNav: NavItem[] = [
  { href: "/staff/overview",  label: "Overview" },
  { href: "/staff/children",  label: "Children"  }, 
  { href: "/staff/funding",   label: "Funding"   },
  { href: "/staff/requests",  label: "Requests" },
  { href: "/staff/documents", label: "Documents" },
  { href: "/staff/reminders", label: "Reminders" },

  ];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <SideNav
      navItems={staffNav}
      sidebarColor="#24364B"
      pageBg="#FAF9F7"
      activeColor="#4CAF78"
      showBrandText={false}
      headerText="STAFF"
      logoWidth={180}
      logoHeight={64}
      width={220}
    >
      {children}
    </SideNav>
  );
}

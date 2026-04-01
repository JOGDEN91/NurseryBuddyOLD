"use client";

import SideNav, { NavItem } from "../../components/layout/SideNav";

const staffNav: NavItem[] = [
  { href: "/staff/overview",  label: "Overview" },
  { href: "/staff/funding",   label: "Funding"   },
  { href: "/staff/requests",  label: "Requests" },
  { href: "/staff/documents", label: "Documents" },
  { href: "/staff/reminders", label: "Reminders" },
  { href: "/staff/children",  label: "Children"  },

];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <SideNav
      navItems={staffNav}
      // visuals
      sidebarColor="#24364B"
      pageBg="#FAF9F7"
      activeColor="#4CAF78"
      // branding per your request
      showBrandText={false}     // hide “Nursery Buddy” text under logo
      headerText="STAFF"        // show STAFF title above the menu
      logoWidth={180}           // bigger logo
      logoHeight={64}
      // width={220}            // optional: uncomment to tweak sidebar width globally
    >
      {children}
    </SideNav>
  );
}
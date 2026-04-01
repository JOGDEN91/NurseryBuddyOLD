// app/admin/layout.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SideNav, { NavItem } from "@/components/layout/SideNav";

const adminNav: NavItem[] = [
  { href: "/admin/overview",          label: "Overview" },
  { href: "/admin/onboarding",        label: "Onboarding" },        // org signup, invites
  { href: "/admin/organisations",     label: "Organisations" },     // groups/companies
  { href: "/admin/nurseries",         label: "Nurseries" },         // sites
  { href: "/admin/users",             label: "Users & Access" },    // roles, resets
  { href: "/admin/access",            label: "Access" },
  { href: "/admin/local-authorities", label: "Local Authorities" }, // catalog + rates
  { href: "/admin/billing",           label: "Billing" },           // plans/invoices
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SideNav
      navItems={adminNav}
      sidebarColor="#24364B"
      pageBg="#FAF9F7"
      activeColor="#4CAF78"
      showBrandText={false}
      headerText="ADMIN"
      logoWidth={180}
      logoHeight={64}
    >
      {children}
    </SideNav>
  );
}

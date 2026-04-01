"use client";

import FundingClient from "./FundingClient";

/**
 * Simple pass-through page for the Org funding table.
 * No ChildrenClient import; modal is mounted by layout.tsx.
 */
export default function OrgFundingPage() {
  // nursery comes from Org scope switcher inside FundingClient
  return <FundingClient />;
}

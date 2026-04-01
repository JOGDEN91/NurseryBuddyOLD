"use client";

import { ScopeProvider } from "@/components/scope/ScopeProvider";
import FundingClient from "@/app/org/funding/FundingClient";

/** Wrap FundingClient in ScopeProvider for the staff route */
export default function StaffFundingWrapper() {
  return (
    <ScopeProvider>
      <FundingClient />
    </ScopeProvider>
  );
}

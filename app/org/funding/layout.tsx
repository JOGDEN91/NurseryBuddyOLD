"use client";

import React from "react";
import ChildModal from "@/components/child/ChildModal";

export default function OrgFundingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ChildModal />
    </>
  );
}

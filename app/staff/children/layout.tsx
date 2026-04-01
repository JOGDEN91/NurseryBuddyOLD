"use client";

import React from "react";
import ChildModal from "@/components/child/ChildModal";

export default function StaffChildrenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {/* The modal opens when the URL has ?child=<uuid> */}
      <ChildModal />
    </>
  );
}

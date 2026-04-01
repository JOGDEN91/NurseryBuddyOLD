"use client";

import React from "react";
import ChildModal from "@/components/child/ChildModal";

export default function OrgChildrenLayout({
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

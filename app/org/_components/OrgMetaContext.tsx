// app/org/_components/OrgMetaContext.tsx
"use client";

import React, { createContext, useContext } from "react";

type OrgMeta = {
  orgName: string;
  nurseries: { id: string; name: string }[];
};

const OrgMetaContext = createContext<OrgMeta | null>(null);

export function OrgMetaProvider({
  orgName,
  nurseries,
  children,
}: OrgMeta & { children: React.ReactNode }) {
  return (
    <OrgMetaContext.Provider value={{ orgName, nurseries }}>
      {children}
    </OrgMetaContext.Provider>
  );
}

export function useOrgMeta(): OrgMeta {
  const ctx = useContext(OrgMetaContext);
  if (!ctx) {
    throw new Error("useOrgMeta must be used within OrgMetaProvider");
  }
  return ctx;
}
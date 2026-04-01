"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type ScopeMode = "org" | "nursery";

type Scope = {
  mode: ScopeMode;
  nurseryId: string | null;
  setMode: (m: ScopeMode) => void;
  setNurseryId: (id: string | null) => void;
};

const Ctx = createContext<Scope | null>(null);

export function ScopeProvider({
  initialMode,
  initialNurseryId,
  children,
}: {
  initialMode: ScopeMode;
  initialNurseryId: string | null;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ScopeMode>(initialMode);
  const [nurseryId, setNurseryId] = useState<string | null>(initialNurseryId);
  const value = useMemo(
    () => ({ mode, nurseryId, setMode, setNurseryId }),
    [mode, nurseryId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScope must be used within ScopeProvider");
  return v;
}

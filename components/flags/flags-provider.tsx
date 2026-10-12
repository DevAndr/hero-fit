"use client";

import { createContext, useContext, useMemo } from "react";
import type { FlagKey } from "@/lib/flags/registry";

const FlagsContext = createContext<ReadonlySet<FlagKey>>(new Set());

/** Включённые флаги текущего пользователя (считает сервер в layout). Только для показа — сервер проверяет сам. */
export function FlagsProvider({ flags, children }: { flags: FlagKey[]; children: React.ReactNode }) {
  const set = useMemo(() => new Set(flags), [flags]);
  return <FlagsContext.Provider value={set}>{children}</FlagsContext.Provider>;
}

export function useFlag(key: FlagKey): boolean {
  return useContext(FlagsContext).has(key);
}

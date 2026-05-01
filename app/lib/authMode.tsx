"use client";

import { createContext, useContext } from "react";

export type AuthMode = "wagmi" | "web3auth";

const AuthModeContext = createContext<AuthMode>("wagmi");

export function AuthModeProvider({ mode, children }: { mode: AuthMode; children: React.ReactNode }) {
  return <AuthModeContext.Provider value={mode}>{children}</AuthModeContext.Provider>;
}

export function useAuthMode(): AuthMode {
  return useContext(AuthModeContext);
}

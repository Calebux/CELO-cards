"use client";

import { createContext, useContext } from "react";

export type AuthMode = "wagmi" | "web3auth";

type AuthModeContextValue = {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  web3AuthEnabled: boolean;
  socialLoginRequested: boolean;
  requestSocialLogin: () => void;
  clearSocialLoginRequest: () => void;
};

const AuthModeContext = createContext<AuthModeContextValue>({
  mode: "wagmi",
  setMode: () => {},
  web3AuthEnabled: false,
  socialLoginRequested: false,
  requestSocialLogin: () => {},
  clearSocialLoginRequest: () => {},
});

export function AuthModeProvider({
  value,
  children,
}: {
  value: AuthModeContextValue;
  children: React.ReactNode;
}) {
  return <AuthModeContext.Provider value={value}>{children}</AuthModeContext.Provider>;
}

export function useAuthMode(): AuthModeContextValue {
  return useContext(AuthModeContext);
}

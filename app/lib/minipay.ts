// MiniPay wallet detection and Celo address helpers

import type { EIP1193Provider } from "viem";
import { injected } from "wagmi/connectors";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  // MiniPay injects window.ethereum with isMiniPay = true
  return !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
}

export const miniPayConnector = injected({
  shimDisconnect: false,
  unstable_shimAsyncInject: 3_000,
  target: {
    id: "minipay",
    name: "MiniPay",
    provider(window) {
      const provider = window?.ethereum as MiniPayProvider | undefined;
      return provider?.isMiniPay ? provider : undefined;
    },
  },
});

export function getMiniPayConnector() {
  return miniPayConnector;
}

export async function getMiniPayAddress(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const provider = window.ethereum as {
      request: (args: { method: string }) => Promise<string[]>;
    } | undefined;
    if (!provider) return null;
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// MiniPay wallet detection and Celo address helpers

import { toHex, type EIP1193Provider } from "viem";
import { injected } from "wagmi/connectors";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

const CELO_CHAIN_HEX = "0xa4ec";

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  // MiniPay injects window.ethereum with isMiniPay = true
  return !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
}

export function getMiniPayProvider(): MiniPayProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = window.ethereum as MiniPayProvider | undefined;
  return provider?.isMiniPay ? provider : undefined;
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
  const provider = getMiniPayProvider();
  try {
    if (!provider) return null;
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

export async function sendMiniPayNativeTransaction(args: {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  gas?: bigint;
  data?: `0x${string}`;
}): Promise<`0x${string}`> {
  const provider = getMiniPayProvider();
  if (!provider) {
    throw new Error("MiniPay wallet not available.");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CELO_CHAIN_HEX }],
    });
  } catch {
    // MiniPay is typically already pinned to Celo mainnet.
  }

  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: args.from,
      to: args.to,
      value: toHex(args.value),
      gas: toHex(args.gas ?? 21000n),
      data: args.data ?? "0x",
    }],
  });

  return hash as `0x${string}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

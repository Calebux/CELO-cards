// MiniPay wallet detection and Celo address helpers

import { toHex, type EIP1193Provider } from "viem";
import { injected } from "wagmi/connectors";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

const CELO_CHAIN_HEX = "0xa4ec";

function shouldRetryMiniPayNativeSend(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("permission denied") ||
    message.includes("chain: undefined") ||
    message.includes("unknown rpc error") ||
    message.includes("cannot complete transaction without call data")
  );
}

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  // window.ethereum check — most accurate once provider is injected
  if ((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay) return true;
  // Fallback: server-side UA detection result embedded in the HTML before any JS runs.
  // This fires correctly even when window.ethereum hasn't been injected yet on first render,
  // which is the root cause of pages briefly showing CELO/G$ in MiniPay.
  return document.documentElement.dataset.minipay === "1";
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

  const requestChainAndSend = async () => {
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
  };

  try {
    return await requestChainAndSend();
  } catch (error) {
    if (!shouldRetryMiniPayNativeSend(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    return requestChainAndSend();
  }
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

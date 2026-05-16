// MiniPay wallet detection and Celo address helpers

import { toHex, createWalletClient, custom, encodeFunctionData, type EIP1193Provider } from "viem";
import { celo } from "wagmi/chains";
import { injected } from "wagmi/connectors";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

const CELO_CHAIN_HEX = "0xa4ec";
const MINIPAY_STORAGE_KEY = "ao:minipay";

function persistMiniPayDetection() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.minipay = "1";
  }
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(MINIPAY_STORAGE_KEY, "1");
    } catch {}
    try {
      window.localStorage.setItem(MINIPAY_STORAGE_KEY, "1");
    } catch {}
  }
}

function hasMiniPayRuntimeHint(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.minipay === "1") {
    return true;
  }
  if (typeof navigator !== "undefined" && /MiniPay/i.test(navigator.userAgent)) {
    return true;
  }
  if (typeof window !== "undefined") {
    try {
      if (window.sessionStorage.getItem(MINIPAY_STORAGE_KEY) === "1") return true;
    } catch {}
    try {
      if (window.localStorage.getItem(MINIPAY_STORAGE_KEY) === "1") return true;
    } catch {}
  }
  return false;
}

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
  if ((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay) {
    persistMiniPayDetection();
    return true;
  }
  // Fallbacks: server/client UA hints plus sticky session/local storage.
  const hinted = hasMiniPayRuntimeHint();
  if (hinted) {
    persistMiniPayDetection();
  }
  return hinted;
}

export function getMiniPayProvider(): MiniPayProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = window.ethereum as MiniPayProvider | undefined;
  if (provider?.isMiniPay) {
    persistMiniPayDetection();
    return provider;
  }
  // Fallback: isMiniPay flag can be missing on first paint if the WebView injects
  // window.ethereum asynchronously. If runtime hints confirm MiniPay (UA header
  // or server-set data-minipay="1"), use window.ethereum directly — there are no
  // third-party wallet extensions inside MiniPay's WebView.
  if (provider && hasMiniPayRuntimeHint()) {
    return provider;
  }
  return undefined;
}

export function getMiniPayWalletClient() {
  const provider = getMiniPayProvider();
  if (!provider) throw new Error("MiniPay wallet not available.");
  return createWalletClient({ chain: celo, transport: custom(provider) });
}

export function getMiniPayWriteOverrides() {
  return isMiniPay()
    ? { type: "legacy" as const }
    : {};
}

export const miniPayConnector = injected({
  shimDisconnect: false,
  unstable_shimAsyncInject: 3_000,
  target: {
    id: "minipay",
    name: "MiniPay",
    // Return window.ethereum without isMiniPay guard — the flag is injected
    // asynchronously, so gating on it caused the connector to return undefined
    // at connect time → wagmi had no provider → writeContractAsync failed.
    // This connector is only used inside MiniPayProviders (MiniPay WebView).
    provider(window) {
      return window?.ethereum as MiniPayProvider | undefined;
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
    const existingAccounts = await provider.request({ method: "eth_accounts" }).catch(() => []) as string[] | undefined;
    if (existingAccounts?.[0]) {
      persistMiniPayDetection();
      return existingAccounts[0];
    }
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[] | undefined;
    if (accounts?.[0]) {
      persistMiniPayDetection();
      return accounts[0];
    }
    return null;
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
  feeCurrency?: `0x${string}`;
}): Promise<`0x${string}`> {
  const provider = getMiniPayProvider();
  if (!provider) {
    throw new Error("MiniPay wallet not available.");
  }

  const requestChainAndSend = async () => {
    // Do NOT call wallet_switchEthereumChain — MiniPay is always pinned to
    // Celo mainnet, and sending that request creates a pending entry in
    // MiniPay's serial request queue that blocks eth_sendTransaction from
    // surfacing as a popup to the user.

    const result = await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: args.from,
        to: args.to,
        value: toHex(args.value),
        gas: toHex(args.gas ?? 21000n),
        data: args.data ?? "0x",
        ...(args.feeCurrency ? { feeCurrency: args.feeCurrency } : {}),
      }],
    });

    if (typeof result === "string") {
      return result as `0x${string}`;
    }
    if (result && typeof result === "object") {
      const hash = (result as { hash?: string; transactionHash?: string }).hash
        ?? (result as { hash?: string; transactionHash?: string }).transactionHash;
      if (typeof hash === "string") {
        return hash as `0x${string}`;
      }
    }
    throw new Error("MiniPay transaction hash missing.");
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

export async function sendMiniPayErc20Transfer(args: {
  from: `0x${string}`;
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  gas?: bigint;
}): Promise<`0x${string}`> {
  const transferData = encodeFunctionData({
    abi: [{
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    }] as const,
    functionName: "transfer",
    args: [args.to, args.amount],
  });

  return sendMiniPayNativeTransaction({
    from: args.from,
    to: args.token,
    value: 0n,
    data: transferData,
    gas: args.gas ?? 100000n,
  });
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

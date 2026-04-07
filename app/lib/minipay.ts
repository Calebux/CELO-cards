// MiniPay wallet detection and Celo address helpers

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  // MiniPay injects window.ethereum with isMiniPay = true
  return !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
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

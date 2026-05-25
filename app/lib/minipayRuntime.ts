import type { EIP1193Provider } from "viem";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

const MINIPAY_STORAGE_KEY = "ao:minipay";

function clearPersistedMiniPayHint() {
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.minipay;
  }
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(MINIPAY_STORAGE_KEY);
    } catch {}
    try {
      window.localStorage.removeItem(MINIPAY_STORAGE_KEY);
    } catch {}
  }
}

function hasMiniPayUserAgent(): boolean {
  return typeof navigator !== "undefined" && /MiniPay/i.test(navigator.userAgent);
}

export function persistMiniPayDetection() {
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

export function hasMiniPayRuntimeHint(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.minipay === "1") {
    return true;
  }
  return hasMiniPayUserAgent();
}

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.ethereum as MiniPayProvider | undefined)?.isMiniPay) {
    persistMiniPayDetection();
    return true;
  }
  const hinted = hasMiniPayRuntimeHint();
  if (hinted) {
    persistMiniPayDetection();
  } else {
    clearPersistedMiniPayHint();
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
  if (provider && hasMiniPayRuntimeHint()) {
    return provider;
  }
  clearPersistedMiniPayHint();
  return undefined;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type { MiniPayProvider };

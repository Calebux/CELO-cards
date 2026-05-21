import type { EIP1193Provider } from "viem";

type MiniPayProvider = EIP1193Provider & {
  isMiniPay?: boolean;
};

const MINIPAY_STORAGE_KEY = "ao:minipay";

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

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.ethereum as MiniPayProvider | undefined)?.isMiniPay) {
    persistMiniPayDetection();
    return true;
  }
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
  if (provider && hasMiniPayRuntimeHint()) {
    return provider;
  }
  return undefined;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type { MiniPayProvider };

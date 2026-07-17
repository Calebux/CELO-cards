"use client";

import { useLayoutEffect, useState } from "react";
import { isMiniPay } from "./minipayRuntime";

import type { MiniPayStableKey } from "./stablecoins";

export type PremiumPaymentCurrency = "celo" | "gdollar" | "usdt" | "usdc" | "cusd";

export const MINIPAY_DEPOSIT_DEEPLINK = "https://link.minipay.xyz/add_cash?tokens=USDT,USDC,USDm";
export const MINIPAY_STABLECOIN_EXPLAINER =
  "Pay with the stablecoin you already hold — USDT, USDC, or USDm. We pre-select whichever you have the most of.";
export const MINIPAY_STABLECOIN_SHORT =
  "Pays with your preferred stablecoin.";

export const PREMIUM_PAYMENT_META = {
  celo: {
    key: "celo" as const,
    label: "CELO",
    actionLabel: "Pay with CELO",
    color: "#f9c846",
  },
  gdollar: {
    key: "gdollar" as const,
    label: "G$",
    actionLabel: "Pay with G$",
    color: "#00C58E",
  },
  usdt: {
    key: "usdt" as const,
    label: "USDT",
    actionLabel: "Pay with USDT",
    color: "#26a17b",
  },
  usdc: {
    key: "usdc" as const,
    label: "USDC",
    actionLabel: "Pay with USDC",
    color: "#2775CA",
  },
  cusd: {
    key: "cusd" as const,
    label: "USDm",
    actionLabel: "Pay with USDm",
    color: "#56a4cb",
  },
} as const;

function readMiniPayModeSnapshot(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.minipay === "1") {
    return true;
  }
  if (typeof window !== "undefined") {
    return isMiniPay();
  }
  return false;
}

export function getInitialMiniPayMode(): boolean {
  return readMiniPayModeSnapshot();
}

export function useMiniPayMode(): boolean {
  const [miniPayMode, setMiniPayMode] = useState<boolean>(() => readMiniPayModeSnapshot());

  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const sync = () => {
      if (cancelled) return true;
      const next = readMiniPayModeSnapshot();
      setMiniPayMode(next);
      return next;
    };

    if (sync()) {
      return () => {
        cancelled = true;
      };
    }

    const retry = window.setInterval(() => {
      attempts += 1;
      if (sync() || attempts > 40) {
        window.clearInterval(retry);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(retry);
    };
  }, []);

  return miniPayMode;
}

// MiniPay: all three supported stablecoins, preferred (highest balance) first
// so payment UIs auto-select it. Web: G$ and CELO as before.
export function getPremiumPaymentOptions(isMiniPayMode: boolean, preferredStable: MiniPayStableKey = "usdt") {
  if (!isMiniPayMode) {
    return [PREMIUM_PAYMENT_META.gdollar, PREMIUM_PAYMENT_META.celo];
  }
  const stables = [PREMIUM_PAYMENT_META.usdt, PREMIUM_PAYMENT_META.usdc, PREMIUM_PAYMENT_META.cusd];
  return stables.sort((a, b) => (a.key === preferredStable ? -1 : 0) - (b.key === preferredStable ? -1 : 0));
}

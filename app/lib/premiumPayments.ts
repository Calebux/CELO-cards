"use client";

import { useLayoutEffect, useState } from "react";
import { isMiniPay } from "./minipay";

export type PremiumPaymentCurrency = "celo" | "gdollar" | "usdt";

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
      if (sync() || attempts > 8) {
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

export function getPremiumPaymentOptions(isMiniPayMode: boolean) {
  return isMiniPayMode
    ? [PREMIUM_PAYMENT_META.usdt]
    : [PREMIUM_PAYMENT_META.celo, PREMIUM_PAYMENT_META.gdollar];
}

"use client";

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

export function getInitialMiniPayMode(): boolean {
  return typeof window !== "undefined" && isMiniPay();
}

export function getPremiumPaymentOptions(isMiniPayMode: boolean) {
  return isMiniPayMode
    ? [PREMIUM_PAYMENT_META.usdt]
    : [PREMIUM_PAYMENT_META.celo, PREMIUM_PAYMENT_META.gdollar];
}

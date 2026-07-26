"use client";

import { useEffect } from "react";
import { useGameStore } from "./gameStore";

type TradeSyncResponse = {
  grants?: string[];
  revokes?: string[];
};

export function useTradeCardSync(address: string | undefined) {
  const { unlockedPremiumCards, purchaseCard, removePremiumCard } = useGameStore();

  useEffect(() => {
    if (!address) return;
    fetch(`/api/trade?address=${address.toLowerCase()}&view=grants`)
      .then((r) => (r.ok ? r.json() as Promise<TradeSyncResponse> : null))
      .then((data) => {
        data?.grants?.forEach((cardId) => {
          if (!unlockedPremiumCards.includes(cardId)) purchaseCard(cardId, 0);
        });
        data?.revokes?.forEach((cardId) => {
          if (unlockedPremiumCards.includes(cardId)) removePremiumCard(cardId);
        });
      })
      .catch(() => {});
  }, [address, unlockedPremiumCards, purchaseCard, removePremiumCard]);
}

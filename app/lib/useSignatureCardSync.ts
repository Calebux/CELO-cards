"use client";

import { useAccount, useSignMessage } from "wagmi";
import { ATTUNEMENT_LIMIT, buildCardProgressAuthMessage } from "./cardProgress";
import { useGameStore } from "./gameStore";
import { isMiniPay } from "./minipay";

type AttunementSnapshot = {
  attunedCardIds: string[];
  cardPerformance: Record<string, { timesPlayed: number; clashWins: number; totalKnock: number; matchWins: number; bestKnock: number }>;
  updatedAt: number;
};

export function useAttunementSync() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const hydrateCardProgress = useGameStore((state) => state.hydrateCardProgress);

  const toggleAttunedCard = async (currentAttunedCardIds: string[], targetCardId: string) => {
    if (!address) {
      throw new Error("Connect your wallet first.");
    }

    const lower = address.toLowerCase();
    const alreadyAttuned = currentAttunedCardIds.includes(targetCardId);
    if (!alreadyAttuned && currentAttunedCardIds.length >= ATTUNEMENT_LIMIT) {
      throw new Error(`Only ${ATTUNEMENT_LIMIT} cards can be attuned at once.`);
    }
    const nextAttunedCardIds = alreadyAttuned
      ? currentAttunedCardIds.filter((cardId) => cardId !== targetCardId)
      : [...currentAttunedCardIds, targetCardId];

    const authResponse = await fetch(`/api/card-progress/auth?address=${lower}`, { cache: "no-store" });
    const authData = (await authResponse.json().catch(() => null)) as { nonce?: string; issuedAt?: string; error?: string } | null;
    if (!authResponse.ok || !authData?.nonce || !authData.issuedAt) {
      throw new Error(authData?.error ?? "Failed to prepare attunement update.");
    }

    const miniPay = isMiniPay();
    let signature = "";
    if (!miniPay) {
      signature = await signMessageAsync({
        message: buildCardProgressAuthMessage(lower, nextAttunedCardIds, authData.nonce, authData.issuedAt),
      });
    }

    const response = await fetch("/api/card-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: lower,
        attunedCardIds: nextAttunedCardIds,
        signature,
        isMiniPay: miniPay,
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string; snapshot?: AttunementSnapshot } | null;
    if (!response.ok || !data?.snapshot) {
      throw new Error(data?.error ?? "Failed to update attuned cards.");
    }

    hydrateCardProgress(data.snapshot);
    return data.snapshot;
  };

  return { toggleAttunedCard };
}

export const useSignatureCardSync = useAttunementSync;

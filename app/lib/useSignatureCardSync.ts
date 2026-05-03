"use client";

import { useAccount, useSignMessage } from "wagmi";
import { buildCardProgressAuthMessage } from "./cardProgress";
import { useGameStore } from "./gameStore";

type SignatureSnapshot = {
  signatureCardId: string | null;
  cardPerformance: Record<string, { timesPlayed: number; clashWins: number; totalKnock: number; matchWins: number; bestKnock: number }>;
  updatedAt: number;
};

export function useSignatureCardSync() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const hydrateCardProgress = useGameStore((state) => state.hydrateCardProgress);

  const toggleSignatureCard = async (currentSignatureCardId: string | null, targetCardId: string) => {
    if (!address) {
      throw new Error("Connect your wallet first.");
    }

    const lower = address.toLowerCase();
    const nextSignatureCardId = currentSignatureCardId === targetCardId ? null : targetCardId;

    const authResponse = await fetch(`/api/card-progress/auth?address=${lower}`, { cache: "no-store" });
    const authData = (await authResponse.json().catch(() => null)) as { nonce?: string; issuedAt?: string; error?: string } | null;
    if (!authResponse.ok || !authData?.nonce || !authData.issuedAt) {
      throw new Error(authData?.error ?? "Failed to prepare signature update.");
    }

    const signature = await signMessageAsync({
      message: buildCardProgressAuthMessage(lower, nextSignatureCardId, authData.nonce, authData.issuedAt),
    });

    const response = await fetch("/api/card-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: lower,
        signatureCardId: nextSignatureCardId,
        signature,
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string; snapshot?: SignatureSnapshot } | null;
    if (!response.ok || !data?.snapshot) {
      throw new Error(data?.error ?? "Failed to update signature card.");
    }

    hydrateCardProgress(data.snapshot);
    return data.snapshot;
  };

  return { toggleSignatureCard };
}

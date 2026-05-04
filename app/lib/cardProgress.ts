import { recoverMessageAddress } from "viem";

export const ATTUNEMENT_LIMIT = 2;

export type CardPerformanceStats = {
  timesPlayed: number;
  clashWins: number;
  totalKnock: number;
  matchWins: number;
  bestKnock: number;
};

export type CardProgressPayload = {
  attunedCardIds: string[];
  cardPerformance: Record<string, CardPerformanceStats>;
  updatedAt: number;
};

export function emptyCardPerformance(): CardPerformanceStats {
  return {
    timesPlayed: 0,
    clashWins: 0,
    totalKnock: 0,
    matchWins: 0,
    bestKnock: 0,
  };
}

export function emptyCardProgress(): CardProgressPayload {
  return {
    attunedCardIds: [],
    cardPerformance: {},
    updatedAt: 0,
  };
}

export function buildCardProgressAuthMessage(address: string, attunedCardIds: string[], nonce: string, issuedAt: string): string {
  return [
    "Action Order Attunement Update",
    "",
    `Address: ${address.toLowerCase()}`,
    `Attuned Cards: ${attunedCardIds.length ? attunedCardIds.join(",") : "none"}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function verifyCardProgressSignature(
  address: string,
  attunedCardIds: string[],
  nonce: string,
  issuedAt: string,
  signature: string
): Promise<boolean> {
  if (!signature?.startsWith("0x")) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: buildCardProgressAuthMessage(address, attunedCardIds, nonce, issuedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

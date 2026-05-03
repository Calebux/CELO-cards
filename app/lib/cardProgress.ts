import { recoverMessageAddress } from "viem";

export type CardPerformanceStats = {
  timesPlayed: number;
  clashWins: number;
  totalKnock: number;
  matchWins: number;
  bestKnock: number;
};

export type CardProgressPayload = {
  signatureCardId: string | null;
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
    signatureCardId: null,
    cardPerformance: {},
    updatedAt: 0,
  };
}

export function buildCardProgressAuthMessage(address: string, signatureCardId: string | null, nonce: string, issuedAt: string): string {
  return [
    "Action Order Signature Card Update",
    "",
    `Address: ${address.toLowerCase()}`,
    `Signature Card: ${signatureCardId ?? "none"}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function verifyCardProgressSignature(
  address: string,
  signatureCardId: string | null,
  nonce: string,
  issuedAt: string,
  signature: string
): Promise<boolean> {
  if (!signature?.startsWith("0x")) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: buildCardProgressAuthMessage(address, signatureCardId, nonce, issuedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

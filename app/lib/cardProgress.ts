import { recoverTypedDataAddress } from "viem";

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

// EIP-712 typed data — supported by both MiniPay (eth_signTypedData_v4) and
// standard wallets. Replaces the personal_sign path which MiniPay does not support.
export const CARD_PROGRESS_TYPED_DOMAIN = {
  name: "Action Order",
  version: "1",
  chainId: 42220, // Celo mainnet
} as const;

export const CARD_PROGRESS_TYPED_TYPES = {
  AttunementUpdate: [
    { name: "wallet", type: "address" },
    { name: "cards", type: "string" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "string" },
  ],
} as const;

export function buildCardProgressTypedMessage(
  address: string,
  attunedCardIds: string[],
  nonce: string,
  issuedAt: string,
) {
  return {
    wallet: address.toLowerCase() as `0x${string}`,
    cards: attunedCardIds.length ? attunedCardIds.join(",") : "none",
    nonce,
    issuedAt,
  };
}

export async function verifyCardProgressSignature(
  address: string,
  attunedCardIds: string[],
  nonce: string,
  issuedAt: string,
  signature: string,
): Promise<boolean> {
  if (!signature?.startsWith("0x")) return false;
  try {
    const recovered = await recoverTypedDataAddress({
      domain: CARD_PROGRESS_TYPED_DOMAIN,
      types: CARD_PROGRESS_TYPED_TYPES,
      primaryType: "AttunementUpdate",
      message: buildCardProgressTypedMessage(address, attunedCardIds, nonce, issuedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

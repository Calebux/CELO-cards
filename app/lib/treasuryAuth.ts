import { recoverMessageAddress } from "viem";

export function buildPayoutClaimAuthMessage(address: string, matchId: string, currency: "cusd" | "celo" | "gdollar" | "usdt" | "usdc"): string {
  return [
    "Action Order Wager Payout Claim",
    "",
    `Address: ${address.toLowerCase()}`,
    `Match ID: ${matchId}`,
    `Currency: ${currency}`,
  ].join("\n");
}

/**
 * Signed by the winner to claim a bounty. Binds the signature to the exact
 * wallet AND day, so a signature captured for one day cannot be replayed to
 * claim another.
 */
export function buildBountyClaimAuthMessage(address: string, day: string): string {
  return [
    "Action Order Daily Bounty Claim",
    "",
    `Address: ${address.toLowerCase()}`,
    `Day: ${day}`,
  ].join("\n");
}

export async function verifyTreasuryActionSignature(address: string, signature: string, message: string): Promise<boolean> {
  if (!signature?.startsWith("0x")) return false;
  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

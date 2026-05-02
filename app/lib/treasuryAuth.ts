import { recoverMessageAddress } from "viem";

export function buildPayoutClaimAuthMessage(address: string, matchId: string, currency: "cusd" | "celo" | "gdollar"): string {
  return [
    "Action Order Wager Payout Claim",
    "",
    `Address: ${address.toLowerCase()}`,
    `Match ID: ${matchId}`,
    `Currency: ${currency}`,
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

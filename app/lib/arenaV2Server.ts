// Server-side KnockOrderArenaV2 helpers — verify a player's stake transfer
// landed at the arena contract, then attribute it on-chain via recordStake.
// Never import from client components.

import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { matchIdToBytes32 } from "./arena";
import { ARENA_V2_ABI, ARENA_V2_ADDRESS, ARENA_V2_ACTIVE, ARENA_V2_STATUS } from "./arenaV2";
import { CUSD_CONTRACT, USDT_CONTRACT, USDC_CONTRACT } from "./cusd";

const TRANSFER_EVENT_ABI = [{
  name: "Transfer", type: "event",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
}] as const;

export const STABLE_TOKEN_BY_CURRENCY: Record<string, `0x${string}`> = {
  usdt: USDT_CONTRACT,
  usdc: USDC_CONTRACT,
  cusd: CUSD_CONTRACT,
};

function clients() {
  const key = process.env.TREASURY_PRIVATE_KEY;
  if (!key) return null;
  const account = privateKeyToAccount(key as `0x${string}`);
  const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
  const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });
  return { account, publicClient, walletClient };
}

/**
 * Verify the stake transfer (player → arena, exact token, >= amount) and
 * attribute it on-chain. Best-effort: returns false on any failure — the
 * payout route falls back to a direct treasury transfer when the on-chain
 * match never became Active.
 */
export async function attributeStakeOnChain(params: {
  matchId: string;
  player: string;
  currency: string;
  amount: string; // bigint string
  txHash: string;
}): Promise<boolean> {
  try {
    const token = STABLE_TOKEN_BY_CURRENCY[params.currency];
    if (!ARENA_V2_ACTIVE || !token) return false;
    const c = clients();
    if (!c) return false;

    const amount = BigInt(params.amount);
    if (amount <= 0n) return false;

    const receipt = await c.publicClient.getTransactionReceipt({ hash: params.txHash as `0x${string}` });
    if (receipt.status !== "success") return false;

    const transfers = parseEventLogs({ abi: TRANSFER_EVENT_ABI, logs: receipt.logs, eventName: "Transfer" });
    const matching = transfers.find(l =>
      l.address.toLowerCase() === token.toLowerCase() &&
      l.args.from.toLowerCase() === params.player.toLowerCase() &&
      l.args.to.toLowerCase() === ARENA_V2_ADDRESS.toLowerCase() &&
      l.args.value >= amount
    );
    if (!matching) return false;

    await c.walletClient.writeContract({
      address: ARENA_V2_ADDRESS,
      abi: ARENA_V2_ABI,
      functionName: "recordStake",
      args: [matchIdToBytes32(params.matchId), params.player as `0x${string}`, token, amount],
    });
    return true;
  } catch {
    return false;
  }
}

export type ArenaMatchState = {
  active: boolean;
  stakers: readonly `0x${string}`[];
  pot: bigint;
};

/** Read the on-chain escrow match. Returns null when ArenaV2 is inactive, the
 *  key is missing, or the match was never recorded on-chain (a legacy/direct
 *  match). Used to bind the payout winner to a real staker. */
export async function getArenaMatch(matchId: string): Promise<ArenaMatchState | null> {
  try {
    if (!ARENA_V2_ACTIVE) return null;
    const c = clients();
    if (!c) return null;
    const [, status, , pot, stakers] = await c.publicClient.readContract({
      address: ARENA_V2_ADDRESS,
      abi: ARENA_V2_ABI,
      functionName: "getMatch",
      args: [matchIdToBytes32(matchId)],
    });
    return { active: status === ARENA_V2_STATUS.Active, stakers, pot };
  } catch {
    return null;
  }
}

/** Settle an Active on-chain match. Returns the tx hash, or null when the
 *  match never made it on-chain (caller falls back to direct transfer). */
export async function completeMatchOnChain(matchId: string, winner: `0x${string}`): Promise<`0x${string}` | null> {
  try {
    if (!ARENA_V2_ACTIVE) return null;
    const c = clients();
    if (!c) return null;

    const id = matchIdToBytes32(matchId);
    const [, status, , pot] = await c.publicClient.readContract({
      address: ARENA_V2_ADDRESS,
      abi: ARENA_V2_ABI,
      functionName: "getMatch",
      args: [id],
    });
    if (status !== ARENA_V2_STATUS.Active || pot === 0n) return null;

    const { request } = await c.publicClient.simulateContract({
      account: c.account,
      address: ARENA_V2_ADDRESS,
      abi: ARENA_V2_ABI,
      functionName: "completeMatch",
      args: [id, winner],
    });
    return await c.walletClient.writeContract(request);
  } catch {
    return null;
  }
}

// Server-side KnockOrderArenaV2 helpers — verify a player's stake transfer
// landed at the arena contract, then attribute it on-chain via recordStake.
// Never import from client components.

import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { matchIdToBytes32 } from "./arena";
import { ARENA_V2_ABI, ARENA_V2_ADDRESS, ARENA_V2_ACTIVE, ARENA_V2_STATUS } from "./arenaV2";
import { CUSD_CONTRACT, USDT_CONTRACT, USDC_CONTRACT } from "./cusd";
import { redis } from "./redis";

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

// One deposit log can back exactly one credit, globally and permanently (H-06).
function stakeLogKey(txHash: string, logIndex: number) {
  return `arena-stake-log:${txHash.toLowerCase()}:${logIndex}`;
}

/**
 * Verify the stake transfer (player → arena, exact token, >= amount), consume
 * its transfer log exactly once, and attribute it on-chain, waiting for the
 * recordStake receipt. Returns true only when the stake is confirmed credited
 * on-chain (H-07); a false return means the caller must not treat the wager
 * as escrowed.
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

    // The client posts right after submitting, so wait briefly for the mine
    // (Celo blocks are ~1s) instead of failing on an unmined tx.
    const receipt = await c.publicClient
      .waitForTransactionReceipt({ hash: params.txHash as `0x${string}`, timeout: 15_000, confirmations: 1 })
      .catch(() => null);
    if (!receipt || receipt.status !== "success") return false;

    // Already credited on-chain → nothing to attribute. This is the case when the
    // player staked via the trustless enterMatch path (which credits itself in the
    // same tx), or when a prior recordStake already landed. Skipping here avoids a
    // guaranteed "already staked" revert and keeps attribution idempotent.
    const alreadyCredited = await getArenaMatch(params.matchId);
    if (alreadyCredited?.stakers.some(s => s.toLowerCase() === params.player.toLowerCase())) return true;

    const transfers = parseEventLogs({ abi: TRANSFER_EVENT_ABI, logs: receipt.logs, eventName: "Transfer" });
    const matching = transfers.find(l =>
      l.address.toLowerCase() === token.toLowerCase() &&
      l.args.from.toLowerCase() === params.player.toLowerCase() &&
      l.args.to.toLowerCase() === ARENA_V2_ADDRESS.toLowerCase() &&
      l.args.value >= amount
    );
    if (!matching || matching.logIndex === null) return false;

    // Atomically consume this transfer log — permanent record, so the same
    // deposit can never be re-attributed to another match or player even
    // while unattributed/fee surplus sits in the contract (H-06).
    const logKey = stakeLogKey(params.txHash, matching.logIndex);
    const consumer = `${params.matchId}:${params.player.toLowerCase()}`;
    const reserved = await redis.set(logKey, consumer, { nx: true });
    if (!reserved) {
      const existing = await redis.get<string>(logKey);
      if (existing !== consumer) return false; // consumed by a different match/player
      // Same consumer retrying: if the earlier recordStake landed, we're done.
      const arena = await getArenaMatch(params.matchId);
      if (arena?.stakers.some(s => s.toLowerCase() === params.player.toLowerCase())) return true;
      // Otherwise fall through and re-broadcast the attribution.
    }

    try {
      const { request } = await c.publicClient.simulateContract({
        account: c.account,
        address: ARENA_V2_ADDRESS,
        abi: ARENA_V2_ABI,
        functionName: "recordStake",
        args: [matchIdToBytes32(params.matchId), params.player as `0x${string}`, token, amount],
      });
      const attributionTx = await c.walletClient.writeContract(request);
      const attributionReceipt = await c.publicClient
        .waitForTransactionReceipt({ hash: attributionTx, timeout: 20_000, confirmations: 1 })
        .catch(() => null);
      if (attributionReceipt?.status === "success") return true;
      if (attributionReceipt?.status === "reverted") {
        await redis.del(logKey).catch(() => {});
        return false;
      }
      // Timed out waiting: the tx may still land. Keep the log reservation —
      // a retry by the same consumer re-checks on-chain state above.
      return false;
    } catch {
      // Simulation/broadcast failed — nothing was consumed on-chain.
      await redis.del(logKey).catch(() => {});
      return false;
    }
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
 *  key is missing, or the match was never recorded on-chain. Used to bind the
 *  payout winner to a real staker. */
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

/** Broadcast settlement of an Active on-chain match. Returns the tx hash, or
 *  null when the match is not Active/settleable. The caller must confirm the
 *  receipt (see waitForArenaReceipt) before recording payout finality (H-07). */
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

/** Check a broadcast arena tx: confirmed success, confirmed revert, or still
 *  pending after the wait window. */
export async function waitForArenaReceipt(txHash: `0x${string}`, timeoutMs = 30_000): Promise<"success" | "reverted" | "pending"> {
  const c = clients();
  if (!c) return "pending";
  const receipt = await c.publicClient
    .waitForTransactionReceipt({ hash: txHash, timeout: timeoutMs, confirmations: 1 })
    .catch(() => null);
  if (!receipt) return "pending";
  return receipt.status === "success" ? "success" : "reverted";
}

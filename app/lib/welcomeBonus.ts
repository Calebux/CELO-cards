// Paying a newly GoodDollar-verified player their one-time welcome bonus.
//
// Extracted from /api/welcome-bonus so the cron sweep pays on exactly the same
// terms. Two code paths that both move money must not be able to drift: the
// once-only reservation, the verification check and the amount all live here.
//
// WHY THIS MATTERS BEYOND THE MONEY. A player who verifies and then only plays
// VS House leaves no on-chain trace — those matches settle in Redis, and the
// MatchRegistry entry that would record them needs CELO for gas that a wallet
// created through social login does not have. This transfer is what makes a
// verified player visible to anyone counting from the chain, and it has to land
// within 24 HOURS of their WhitelistedAdded event to count as onboarded.

import { createPublicClient, createWalletClient, http, parseEther, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis } from "./redis";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI, resolveGoodDollarIdentity } from "./gooddollar";

/**
 * 100 G$ — the price of a season pass, so it is spendable rather than dust.
 * A player who buys a pass with it produces a second on-chain interaction from
 * their own wallet, which is worth more than this one.
 */
export const WELCOME_AMOUNT = parseEther("100");

/** A year: the point is that nobody is ever welcomed twice. */
export const WELCOME_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * A ceiling on what the sweep can spend in one UTC day, in whole bonuses.
 * The per-identity reservation already makes double-payment impossible, so this
 * is not about correctness — it is about blast radius. An automated payer with
 * no human in the loop needs a number it cannot go past however wrong it is.
 */
export const MAX_WELCOMES_PER_DAY = 150;

/**
 * A CELO gas grant — the cheaper way to make a verified player visible.
 *
 * The onboarding metric counts any transaction where the player is one side and
 * one of our addresses is the other, so a transfer from the treasury qualifies
 * on its own. A bare value transfer is 21,000 gas against 229,000 for a G$
 * transfer, so this records a player for roughly a tenth of the gas AND leaves
 * them able to sign their own transactions — recordMatch, signUp, a season pass
 * — none of which a wallet made through social login can do with no CELO.
 *
 * That second half is the point. A zero-value transfer would also satisfy the
 * query and cost slightly less, but it would exist purely to be counted; this
 * gives the player the thing that was actually blocking them.
 */
export const WELCOME_GAS_AMOUNT = parseEther(process.env.WELCOME_GAS_CELO ?? "0.01");

/** Gas the treasury must keep in hand to send anything at all. */
export const MIN_TREASURY_CELO = parseEther("0.02");

export const welcomeKey = (identityKey: string) => `welcome:${identityKey.toLowerCase()}`;
export const gasGrantKey = (identityKey: string) => `welcome:gas:${identityKey.toLowerCase()}`;
const daySpendKey = (day: string) => `welcome:spend:${day}`;

export type WelcomeResult =
  | { status: "sent"; txHash: `0x${string}`; identityKey: string }
  | { status: "already-sent"; identityKey: string }
  | { status: "not-verified" }
  | { status: "day-cap-reached" }
  | { status: "failed"; error: string };

export function utcDay(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Addresses that are ours, not players'. Never welcome automation. */
export function agentAddresses(): Set<string> {
  return new Set(
    (process.env.AGENT_ADDRESSES ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[0-9a-f]{40}$/.test(a)),
  );
}

/**
 * Pay `address` its welcome bonus if it is verified and has never been paid.
 *
 * Keyed on the GoodDollar identity root, not the wallet, so one person with
 * several linked wallets is welcomed once. The reservation is taken BEFORE the
 * transfer and released only if the transfer never happened — a broadcast that
 * we then failed to record must stay reserved, or a retry pays twice.
 *
 * `countAgainstDayCap` is false for the player-facing route: that path is
 * driven by a real person opening the game, and refusing them because an
 * automated sweep used up the day's budget would be the wrong way round.
 */
export async function welcomePlayer(
  publicClient: Pick<PublicClient, "readContract" | "simulateContract">,
  address: string,
  { countAgainstDayCap = true }: { countAgainstDayCap?: boolean } = {},
): Promise<WelcomeResult> {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) return { status: "failed", error: "Treasury not configured" };

  let identity;
  try {
    identity = await resolveGoodDollarIdentity(publicClient, address);
  } catch {
    // Fail closed: never pay a wallet whose verification we could not read.
    return { status: "failed", error: "Could not verify eligibility" };
  }
  if (!identity.isVerified) return { status: "not-verified" };

  const claimKey = welcomeKey(identity.identityKey);
  const reserved = await redis.set(claimKey, Date.now(), { nx: true, ex: WELCOME_TTL_SECONDS });
  if (!reserved) return { status: "already-sent", identityKey: identity.identityKey };

  // Incremented before paying and rolled back on refusal, so two concurrent
  // sweeps cannot both read the old total and each believe there is room.
  const day = utcDay();
  if (countAgainstDayCap) {
    const spent = await redis.incr(daySpendKey(day));
    if (spent === 1) await redis.expire(daySpendKey(day), 7 * 24 * 60 * 60);
    if (spent > MAX_WELCOMES_PER_DAY) {
      await redis.incrby(daySpendKey(day), -1).catch(() => {});
      await redis.del(claimKey).catch(() => {});
      return { status: "day-cap-reached" };
    }
  }

  let broadcast: `0x${string}` | null = null;
  try {
    const account = privateKeyToAccount(
      (treasuryKey.startsWith("0x") ? treasuryKey : `0x${treasuryKey}`) as `0x${string}`,
    );
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });

    // simulateContract estimates the gas. G$ is not a plain ERC-20 — a transfer
    // to a new holder measures around 229,000 — so a hardcoded limit is how you
    // send a batch that all reverts.
    const { request } = await publicClient.simulateContract({
      account,
      address: GDOLLAR_CONTRACT,
      abi: GDOLLAR_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, WELCOME_AMOUNT],
    });
    const txHash = await walletClient.writeContract(request);
    broadcast = txHash;
    return { status: "sent", txHash, identityKey: identity.identityKey };
  } catch (e) {
    if (!broadcast) {
      // Nothing left the treasury, so give the slot and the budget back.
      await redis.del(claimKey).catch(() => {});
      if (countAgainstDayCap) await redis.incrby(daySpendKey(day), -1).catch(() => {});
    }
    return { status: "failed", error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Send `address` a one-time CELO gas grant if it is verified and has not had one.
 *
 * Same shape as welcomePlayer — reserve, send, roll back only if nothing was
 * broadcast — but under its own key, so switching the sweep between modes never
 * locks a player out of the one they have not had. Both share the day counter,
 * because the cap exists to bound a runaway payer, not a particular token.
 */
export async function grantGas(
  publicClient: Pick<PublicClient, "readContract" | "getBalance" | "estimateGas">,
  address: string,
  { countAgainstDayCap = true }: { countAgainstDayCap?: boolean } = {},
): Promise<WelcomeResult> {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) return { status: "failed", error: "Treasury not configured" };

  let identity;
  try {
    identity = await resolveGoodDollarIdentity(publicClient, address);
  } catch {
    return { status: "failed", error: "Could not verify eligibility" };
  }
  if (!identity.isVerified) return { status: "not-verified" };

  const claimKey = gasGrantKey(identity.identityKey);
  const reserved = await redis.set(claimKey, Date.now(), { nx: true, ex: WELCOME_TTL_SECONDS });
  if (!reserved) return { status: "already-sent", identityKey: identity.identityKey };

  const day = utcDay();
  if (countAgainstDayCap) {
    const spent = await redis.incr(daySpendKey(day));
    if (spent === 1) await redis.expire(daySpendKey(day), 7 * 24 * 60 * 60);
    if (spent > MAX_WELCOMES_PER_DAY) {
      await redis.incrby(daySpendKey(day), -1).catch(() => {});
      await redis.del(claimKey).catch(() => {});
      return { status: "day-cap-reached" };
    }
  }

  let broadcast: `0x${string}` | null = null;
  try {
    const account = privateKeyToAccount(
      (treasuryKey.startsWith("0x") ? treasuryKey : `0x${treasuryKey}`) as `0x${string}`,
    );
    const walletClient = createWalletClient({ account, chain: celo, transport: http() });
    const txHash = await walletClient.sendTransaction({
      to: address as `0x${string}`,
      value: WELCOME_GAS_AMOUNT,
    });
    broadcast = txHash;
    return { status: "sent", txHash, identityKey: identity.identityKey };
  } catch (e) {
    if (!broadcast) {
      await redis.del(claimKey).catch(() => {});
      if (countAgainstDayCap) await redis.incrby(daySpendKey(day), -1).catch(() => {});
    }
    return { status: "failed", error: e instanceof Error ? e.message : "Failed" };
  }
}

/** How many bonuses the sweep has paid today, and what is left of the cap. */
export async function welcomeSpendToday(): Promise<{ spent: number; remaining: number }> {
  const spent = Number((await redis.get<number>(daySpendKey(utcDay()))) ?? 0);
  return { spent, remaining: Math.max(0, MAX_WELCOMES_PER_DAY - spent) };
}

/** A public client on the same RPC the payment path uses. */
export function welcomeRpcClient() {
  return createPublicClient({ chain: celo, transport: http() });
}

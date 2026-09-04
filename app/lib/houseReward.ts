// House Boss reward payouts.
//
// A win is recorded as `pending` and stays that way until someone on ops marks
// it verified. Only then does the player's claim button go live, and claiming
// sends the prize from the treasury.
//
// The approval step is the sybil defence, and it is doing real work. There is
// no identity signal available here — most winners come through MiniPay and
// have no GoodDollar identity — while a throwaway wallet costs a farmer only a
// $0.50 weekly pass plus $0.80 for the cheapest black market card, the two
// things needed to reach Hard. That is $1.30 chasing a $5 prize, so an
// automatic payout would be worth farming. A human deciding which wins are real
// costs one click and removes the incentive entirely.

import { POOL_PRIZE_USD, REWARD_USD } from "./houseRewardConfig";

export { POOL_PRIZE_USD, REWARD_USD };

/** One claim per wallet, for the life of the pool. */
export const houseClaimKey = (address: string) => `house-reward-claim:${address.toLowerCase()}`;
/** Total paid out so far, in whole cents, across every claimant. */
export const HOUSE_SPEND_CENTS_KEY = "house-reward-spend-cents";
/** A paid claim must outlive the record it was paid against. */
export const HOUSE_CLAIM_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * Hard ceiling on everything this pool can ever pay, in cents.
 *
 * Derived from a constant rather than read from Redis on purpose: C-02 removed
 * treasury payments sized by stored values, and the same rule applies here. A
 * corrupted reward record must not be able to drain the treasury.
 */
export const MAX_POOL_PAYOUT_CENTS = Math.round(POOL_PRIZE_USD * 100);
export const REWARD_CENTS = Math.round(REWARD_USD * 100);

export type ClaimableState =
  | {
      claimable: false;
      reason: "no-win" | "pending-review" | "already-claimed" | "pool-empty" | "points-only";
    }
  | { claimable: true };

export type RewardRecordLike = {
  status?: "verified" | "pending";
  rewardCode?: string;
  rewardUsd?: number;
};

/** Mirrors the board's rule: only a verified record with a code is a real prize. */
export function isVerifiedReward(record: RewardRecordLike | null | undefined): boolean {
  return !!record && record.status === "verified" && !!record.rewardCode;
}

/**
 * Whether a wallet may claim right now.
 *
 * Kept pure so the button and the endpoint cannot disagree about what
 * "claimable" means — the UI showing a live button over a claim the server
 * refuses is the failure this exists to prevent.
 */
export function claimableState(params: {
  record: RewardRecordLike | null | undefined;
  alreadyClaimed: boolean;
  spentCents: number;
}): ClaimableState {
  if (!params.record) return { claimable: false, reason: "no-win" };
  if (params.alreadyClaimed) return { claimable: false, reason: "already-claimed" };
  // Won while the cash prize was paused: points only, and the record says so by
  // carrying no dollar value. Checked from the record rather than from today's
  // pause state, so resuming the prize later cannot retroactively make these
  // claimable — and a win banked while it was running stays claimable through a
  // pause, which is the direction that protects players.
  if ((params.record.rewardUsd ?? 0) <= 0) return { claimable: false, reason: "points-only" };
  if (!isVerifiedReward(params.record)) return { claimable: false, reason: "pending-review" };
  if (params.spentCents + REWARD_CENTS > MAX_POOL_PAYOUT_CENTS) {
    return { claimable: false, reason: "pool-empty" };
  }
  return { claimable: true };
}

/** Signed by the winner. Bound to the wallet so it cannot be replayed elsewhere. */
export function buildHouseClaimAuthMessage(address: string): string {
  return [
    "Action Order House Boss Prize Claim",
    "",
    `Address: ${address.toLowerCase()}`,
    `Prize: $${REWARD_USD}`,
  ].join("\n");
}

// Public bounty prize config.
//
// Deliberately dependency-free: the landing page announces the prize, and
// importing it from bounty.ts would pull redis and viem into the LCP-critical
// client bundle. Server logic re-exports these from bounty.ts.

// A fixed daily pool shared by the top 3, tiered rather than split evenly: the
// tiers sum to exactly the pool and keep first place worth chasing, where an
// even split would be $3.33 each and awkward to pay. Change to [4, 3, 3] (or
// similar) for a flatter spread — nothing else depends on the shape.
export const BOUNTY_POOL_USD = 10;
export const BOUNTY_PRIZE_SPLIT_USD: readonly number[] = [5, 3, 2];
export const BOUNTY_TOP_N = BOUNTY_PRIZE_SPLIT_USD.length;

export function bountyPrizeForRank(rank: number): number {
  return BOUNTY_PRIZE_SPLIT_USD[rank - 1] ?? 0;
}

// Minimum points in the day to qualify for a prize. Without it, on a quiet day
// a single match could take the pool — which rewards showing up at the right
// moment rather than actually competing.
//
// For scale: a boss win pays 100–200, a ranked PvP win 150 and a loss 25. So
// 500 is roughly three to four decent wins — enough to mean "played today",
// low enough to stay reachable in one sitting.
export const BOUNTY_MIN_POINTS_TO_WIN = 500;

export function meetsBountyThreshold(points: number): boolean {
  return points >= BOUNTY_MIN_POINTS_TO_WIN;
}

// A second, separately funded pool split evenly between EVERYONE who cleared the
// threshold that day — top 3 included. The tiered pool rewards winning; this one
// rewards turning up, which is what keeps the 4th-place player coming back once
// they can see they won't catch 1st today.
//
// A fixed pool rather than a fixed per-head amount, so the daily cost is capped
// no matter how many qualify. The trade-off is that each share shrinks as more
// people qualify: fine at 5 players, thin at 40 — see bountyParticipationShareUsd.
export const BOUNTY_PARTICIPATION_POOL_USD = 4;

/**
 * Even split of the participation pool, floored to whole cents.
 *
 * Floored, not rounded: rounding a sub-cent share UP overspends the pool by the
 * rounding error times the number of qualifiers. At 500 qualifiers a $0.008
 * share rounds to $0.01 and pays out $5 from a $4 pool. Flooring can leave a
 * few cents unspent, which is the safe direction for a fixed budget.
 */
export function bountyParticipationShareUsd(qualifierCount: number): number {
  if (qualifierCount <= 0) return 0;
  return Math.floor((BOUNTY_PARTICIPATION_POOL_USD / qualifierCount) * 100) / 100;
}

// Rough G$ per USD, used only to pre-fill the manual payout block so a rate does
// not have to be looked up every morning — the friction that quietly stops a
// daily payout happening. Matches the landing banner's own conversion
// (431,000 G$ shown as ~$50). Nothing is paid automatically from this; it is a
// starting number a human edits.
export const BOUNTY_GDOLLAR_PER_USD = 8600;

export function usdToGdollar(usd: number): number {
  return Math.round(usd * BOUNTY_GDOLLAR_PER_USD);
}

/**
 * Compact G$ for UI, e.g. "43K G$". Players hold and earn G$, not dollars, so a
 * prize in dollars alone is an abstraction they have to convert themselves.
 * Rounded to 3 significant-ish figures because the rate moves and false
 * precision would imply a promise we are not making.
 */
export function formatGdollar(usd: number): string {
  const amount = usdToGdollar(usd);
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M G$`;
  if (amount >= 10_000) return `${Math.round(amount / 1000)}K G$`;
  if (amount >= 1_000) return `${(amount / 1000).toFixed(1).replace(/\.0$/, "")}K G$`;
  return `${amount} G$`;
}

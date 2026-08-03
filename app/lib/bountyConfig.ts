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

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
// Set against real boards rather than guessed. At 500 almost anyone who turned
// up qualified; at 1500 four of the five days measured would have paid nobody —
// one winner scored 1475 and missed by twenty-five points. 1000 filters casual
// play while staying reachable for the people actually competing, and sits just
// under a typical third place.
//
// For scale: a hard boss win pays 200 (300 flawless), a ranked PvP win 150, and
// the daily cap of ten counted wins puts the ceiling near 3,100.
export const BOUNTY_MIN_POINTS_TO_WIN = 1000;

export function meetsBountyThreshold(points: number): boolean {
  return points >= BOUNTY_MIN_POINTS_TO_WIN;
}

// A second, separately funded pool split evenly between qualifiers who did NOT
// place in the top 3. The tiered pool rewards winning; this one rewards turning
// up, which is what keeps the 4th-place player coming back once they can see
// they won't catch 1st today.
//
// Explicitly excludes the podium: paying it to winners too meant a lone
// qualifier collected $5 for first place AND the entire $4 pool, so a "$5 for
// winning" day paid out $9. On a quiet day the pool now simply goes unspent,
// which is the right outcome — there is nobody it was meant for.
//
// A fixed pool rather than a fixed per-head amount, so the daily cost is capped
// no matter how many qualify. The trade-off is that each share shrinks as more
// people qualify: fine at 5 players, thin at 40 — see bountyParticipationShareUsd.
export const BOUNTY_PARTICIPATION_POOL_USD = 4;

/** Qualifiers eligible for the participation pool: everyone below the podium. */
export function bountyParticipationRecipients(qualifierCount: number): number {
  return Math.max(0, qualifierCount - BOUNTY_TOP_N);
}

/**
 * Even split of the participation pool between its recipients, floored to whole
 * cents. Takes the RECIPIENT count, not the qualifier count.
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

// Where winners go to claim. Payouts are manual, so a player who qualifies needs
// somewhere to actually collect rather than waiting and wondering.
export const BOUNTY_CLAIM_URL = "https://t.me/actionorder/3";

// Daily House wins that count toward the bounty. Lives here rather than in
// bounty.ts so client components can show the limit without pulling in redis.
// bounty.ts re-exports it as HOUSE_WINS_COUNTED_PER_DAY.
export const BOUNTY_WINS_PER_DAY = 10;

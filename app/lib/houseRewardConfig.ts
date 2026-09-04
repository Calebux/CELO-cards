// Prize amounts, kept dependency-free so client components can show them
// without pulling redis or viem into the bundle — the same split bountyConfig
// makes for the daily bounty.

/** Paid to one player for clearing the chamber. */
export const REWARD_USD = 5;
/** Everything the House Boss pool can ever pay, across all winners. */
export const POOL_PRIZE_USD = 50;

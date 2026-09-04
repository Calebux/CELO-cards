// The clean-run points award lives with the rule that decides it, so the banner
// and the scorer can never quote different numbers.
export { HOUSE_BOSS_POINTS_CLEAN as HOUSE_BOSS_POINTS } from "./houseBossRun";

// Prize amounts, kept dependency-free so client components can show them
// without pulling redis or viem into the bundle — the same split bountyConfig
// makes for the daily bounty.

/** Paid to one player for clearing the chamber. */
export const REWARD_USD = 5;
/** Everything the House Boss pool can ever pay, across all winners. */
export const POOL_PRIZE_USD = 50;

// ─────────────────────────────────────────────────────────────────────────────
// THE CASH PRIZE IS PAUSED.
//
// Dated rather than a boolean, for the reason the daily bounty learned the hard
// way: a win already recorded must keep the terms it was won under. Wins from
// this UTC day onward are worth points only and create no money liability;
// everything earned before it stays exactly as claimable as it was, and a claim
// already approved still pays.
//
// To resume: move this to a future day, or set it to null.
// ─────────────────────────────────────────────────────────────────────────────
export const HOUSE_BOSS_CASH_PAUSED_FROM: string | null = "2026-09-04";

/** Whether a win recorded on `day` carries the cash prize. */
export function houseBossCashPaysOn(day: string): boolean {
  return !HOUSE_BOSS_CASH_PAUSED_FROM || day < HOUSE_BOSS_CASH_PAUSED_FROM;
}

/** Whether the cash prize is running right now. */
export function houseBossCashPaused(at: number = Date.now()): boolean {
  return !houseBossCashPaysOn(new Date(at).toISOString().slice(0, 10));
}

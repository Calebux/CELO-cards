// VS House difficulty: scoring and the rules that stop it being claimed rather
// than earned. Kept out of the route so it can be tested directly.

export type HouseDifficulty = 0 | 1 | 2 | 3;

export function clampDifficulty(value: unknown): HouseDifficulty {
  return Math.max(0, Math.min(3, Number(value) || 0)) as HouseDifficulty;
}

// Easy / Moderate / Hard (3 is the internal boss tier, not offered in the UI).
// Beating a harder boss is worth proportionally more toward the daily bounty,
// which keeps the reward for difficulty inside the fixed daily pool rather than
// creating a second, unbounded payout.
// Easy is a practice tier, not a bounty route.
//
// At 0.5 the very best Easy day — ten flawless wins plus the full loss
// allowance — reaches 850, which sits below BOUNTY_MIN_POINTS_TO_WIN. So Easy
// alone can no longer qualify for a share of the pool, and the entry point for
// the bounty becomes Moderate. It stays worth playing for career points, the
// leaderboard and challenges, none of which are capped or tiered.
//
// This does not make Easy harder to win — only worth less. Real win rates when
// this was set: Easy 76%, Hard 45%, Boss 5%.
export const DIFFICULTY_POINT_MULTIPLIER: Record<HouseDifficulty, number> = {
  0: 0.5,
  1: 1.5,
  2: 2,
  3: 2.5,
};

export const HOUSE_WIN_BASE_POINTS = 100;
export const HOUSE_FLAWLESS_BONUS = 50;
export const HOUSE_LOSS_POINTS = 10;

/**
 * Points for a finished VS House match.
 *
 * `rewardDifficulty` must be the difficulty the match STARTED on, never the one
 * the current request asked for — see effectiveAiDifficulty.
 */
export function houseMatchPoints(params: {
  won: boolean;
  flawless: boolean;
  rewardDifficulty: HouseDifficulty;
}): number {
  if (!params.won) return HOUSE_LOSS_POINTS;
  const base = HOUSE_WIN_BASE_POINTS + (params.flawless ? HOUSE_FLAWLESS_BONUS : 0);
  return Math.round(base * DIFFICULTY_POINT_MULTIPLIER[params.rewardDifficulty]);
}

/**
 * Which difficulty the AI actually plays at on a given round.
 *
 * The client escalates mid-match on purpose (upper chamber, win streaks), so a
 * later round may legitimately ask for something harder. That is honoured,
 * because a harder opponent can never be an exploit. It can only go up: a
 * request asking for something easier than the match started on is ignored, and
 * the payout is pinned to the starting difficulty either way.
 *
 * Without this, a player could clear four rounds on easy, send hard on the round
 * that won the match, and collect the hard-mode reward.
 */
export function effectiveAiDifficulty(
  pinned: HouseDifficulty,
  requested: unknown,
): HouseDifficulty {
  return Math.max(pinned, clampDifficulty(requested)) as HouseDifficulty;
}

/**
 * Which difficulty the AI should play at for a VS House round.
 *
 * The House Boss finale still escalates to the boss tier — that fight is meant
 * to be hard, and the player has opted into it.
 *
 * What it no longer does is quietly promote a player to Hard for winning. A
 * two-match win streak used to force difficulty 2 regardless of what they
 * picked, so Easy and Moderate stopped being easy exactly when someone started
 * doing well — and because the reward is pinned to the CHOSEN difficulty, they
 * faced a harder opponent for the same points. If a player wants Hard they can
 * select it.
 */
export function resolveAiDifficulty(params: {
  chosen: 0 | 1 | 2;
  upperChamberActive: boolean;
  upperChamberRound: number;
}): HouseDifficulty {
  // The House Boss finale (round 4 onward) is the one place difficulty is
  // allowed to exceed what the player selected.
  if (params.upperChamberActive && params.upperChamberRound >= 3) return 3;
  return params.chosen;
}

// ── Premium card gate ────────────────────────────────────────────────────────
// The high-multiplier tiers are what the leaderboard is actually made of: a
// Hard flawless win is 300 points and the top of the board is thousands of
// them. Gating Hard and Boss on owning black market cards is what makes those
// tiers something bought into rather than simply ground out.
//
// Ownership, not deck composition — a player who has paid should not also have
// to spend deck slots on the cards to reach the tier they paid for. It also
// keeps the check cheap: one set read per match rather than per round.
//
// Easy and Moderate stay open. A free player can still play, still score, and
// still climb; they are capped at 1.5x rather than shut out.

/** Premium cards owned to unlock Hard (2x). */
export const PREMIUM_CARDS_FOR_HARD = 1;
/** Premium cards owned to unlock Boss (2.5x), including the upper chamber finale. */
export const PREMIUM_CARDS_FOR_BOSS = 3;

/**
 * The highest difficulty a wallet may play for reward, given how many premium
 * cards it owns.
 */
export function maxDifficultyForPremiumCount(ownedCount: number): HouseDifficulty {
  const owned = Number.isFinite(ownedCount) ? Math.max(0, Math.floor(ownedCount)) : 0;
  if (owned >= PREMIUM_CARDS_FOR_BOSS) return 3;
  if (owned >= PREMIUM_CARDS_FOR_HARD) return 2;
  return 1;
}

/**
 * Clamp a requested difficulty down to what the wallet has unlocked.
 *
 * Applied to BOTH the reward tier and the AI the player actually faces. Pinning
 * only the reward would drop a free player into a Hard opponent for Moderate
 * pay — the precise failure effectiveAiDifficulty's comment exists to prevent.
 */
export function gateDifficultyByPremium(
  requested: HouseDifficulty,
  ownedCount: number,
): HouseDifficulty {
  return Math.min(requested, maxDifficultyForPremiumCount(ownedCount)) as HouseDifficulty;
}

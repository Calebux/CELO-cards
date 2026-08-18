// Public bounty prize config.
//
// Deliberately dependency-free: the landing page announces the prize, and
// importing it from bounty.ts would pull redis and viem into the LCP-critical
// client bundle. Server logic re-exports these from bounty.ts.

// ─────────────────────────────────────────────────────────────────────────────
// THE DAILY BOUNTY IS PAUSED BETWEEN CAMPAIGNS.
//
// Days inside the pause window score points as normal but pay no prize, and
// that is enforced server-side — standings return zero money and
// /api/bounty/claim refuses the day outright, so a stale client cannot claim
// one. Days BEFORE the window keep everything they were owed and stay
// claimable, because ending the bounty must not strand money already earned.
//
// A window rather than an on/off switch, because the question is always "was
// THIS day playing for money", and the answer for a day already played must
// never change. A boolean flipped back on would retroactively make every paused
// day claimable at once.
//
// To resume: set BOUNTY_RESUMES_ON_DAY to the first UTC day that pays again.
// To end a fixed campaign: set BOUNTY_PAUSES_AGAIN_ON_DAY to the first UTC day
// after the campaign. Days inside either paused window stay permanently unpaid.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * First UTC day that pays nothing — the day the bounty stopped.
 *
 * Today, so today's board pays nothing and never becomes claimable. Days before
 * it are untouched: whatever they were owed is still owed, and still claimable.
 */
export const BOUNTY_PAUSED_FROM_DAY = "2026-08-13";

/**
 * First UTC day that pays again.
 *
 * The new $100 campaign starts today, 2026-08-18, and pays through 2026-08-27.
 */
export const BOUNTY_RESUMES_ON_DAY: string | null = "2026-08-18";

/** First UTC day after the current 10-day campaign, so it pays 2026-08-18..27. */
export const BOUNTY_PAUSES_AGAIN_ON_DAY: string | null = "2026-08-28";

/** ISO UTC day, e.g. "2026-08-13". ISO dates compare correctly as strings. */
export function bountyDayUTC(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Whether a given UTC day pays no prize. */
export function bountyPausedOn(day: string = bountyDayUTC()): boolean {
  if (day < BOUNTY_PAUSED_FROM_DAY) return false;
  if (BOUNTY_RESUMES_ON_DAY === null || day < BOUNTY_RESUMES_ON_DAY) return true;
  return BOUNTY_PAUSES_AGAIN_ON_DAY !== null && day >= BOUNTY_PAUSES_AGAIN_ON_DAY;
}

/**
 * The last day that still pays before the pause begins, so the UI can warn
 * players in advance instead of the prize silently vanishing overnight.
 */
export function bountyIsFinalPayingDay(day: string = bountyDayUTC()): boolean {
  if (bountyPausedOn(day)) return false;
  return bountyPausedOn(bountyDayUTC(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000));
}

/**
 * The most recent day that still paid, at or before `day`.
 *
 * The claim UI has to keep looking back at that day for as long as the pause
 * lasts. Defaulting to "yesterday" was fine while the bounty ran, but the moment
 * yesterday itself falls inside the pause window it reports nothing to claim —
 * and an unclaimed prize from the last paying day becomes unreachable in the app
 * even though it is still owed.
 */
export function lastPayingDayAtOrBefore(day: string = bountyDayUTC()): string {
  if (!bountyPausedOn(day)) return day;
  if (BOUNTY_PAUSES_AGAIN_ON_DAY !== null && day >= BOUNTY_PAUSES_AGAIN_ON_DAY) {
    return bountyDayUTC(Date.parse(`${BOUNTY_PAUSES_AGAIN_ON_DAY}T00:00:00Z`) - 24 * 60 * 60 * 1000);
  }
  return bountyDayUTC(Date.parse(`${BOUNTY_PAUSED_FROM_DAY}T00:00:00Z`) - 24 * 60 * 60 * 1000);
}

/** Player-facing pause copy, kept in one place so every surface says the same. */
export const BOUNTY_PAUSE_HEADLINE = "Daily bounty paused";
export const BOUNTY_PAUSE_BLURB =
  "The daily prize pool is on hold between campaigns. Matches, points and the leaderboards all keep running, and any prize you already won is still claimable.";

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
// Current campaign: the $10 daily pool is for players who clear 5,000 bounty
// points in that UTC day.
export const BOUNTY_MIN_POINTS_TO_WIN = 5000;

export function meetsBountyThreshold(points: number): boolean {
  return points >= BOUNTY_MIN_POINTS_TO_WIN;
}

// A second, separately funded pool split evenly between qualifiers who did NOT
// place in the top 3. It is disabled for the current $100 campaign so the daily
// spend stays exactly $10.
//
// Explicitly excludes the podium: paying it to winners too meant a lone
// qualifier collected $5 for first place AND the entire $4 pool, so a "$5 for
// winning" day paid out $9. On a quiet day the pool now simply goes unspent,
// which is the right outcome — there is nobody it was meant for.
//
// A fixed pool rather than a fixed per-head amount, so the daily cost is capped
// no matter how many qualify. The trade-off is that each share shrinks as more
// people qualify: fine at 5 players, thin at 40 — see bountyParticipationShareUsd.
export const BOUNTY_PARTICIPATION_POOL_USD = 0;

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
//
// Raised from 10 to 25 for the 5,000-point campaign, because the threshold and
// this cap together decide whether the prize can be won at all. At 10 the day
// topped out at 3,100 (ten flawless Hard wins plus the loss allowance), so a
// 5,000 threshold could only be cleared by beating the House Boss six to eight
// times in one UTC day — at a ~5% boss win rate, roughly 150 boss runs. The
// best score ever recorded on the real board is 2,745. A prize nobody can win
// is worse than no prize, so the ceiling moves with the bar: at 25 the day tops
// out at 7,600, and ~25 Hard wins at the typical 200 each reaches 5,000.
//
// Keep these two in step. Raising BOUNTY_MIN_POINTS_TO_WIN without raising this
// makes the campaign unwinnable; the test suite asserts the threshold stays
// under the ceiling for exactly that reason.
export const BOUNTY_WINS_PER_DAY = 25;

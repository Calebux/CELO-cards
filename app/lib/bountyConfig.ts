// Public bounty prize config.
//
// Deliberately dependency-free: the landing page announces the prize, and
// importing it from bounty.ts would pull redis and viem into the LCP-critical
// client bundle. Server logic re-exports these from bounty.ts.

// ─────────────────────────────────────────────────────────────────────────────
// THE DAILY BOUNTY RUNS AS DATED CAMPAIGNS, NOT AS AN ON/OFF SWITCH.
//
// Days outside every campaign window score points as normal but pay no prize,
// and that is enforced server-side — standings return zero money and
// /api/bounty/claim refuses the day outright, so a stale client cannot claim
// one. Days BEFORE the first pause keep everything they were owed and stay
// claimable, because ending a campaign must not strand money already earned.
//
// A LIST of windows rather than a single one, because the question is always
// "was THIS day playing for money", and the answer for a day already played
// must never change. With one window, opening a second campaign meant moving
// the window's edges — which retroactively unpaid every day of the first one,
// wiping prizes that had already been won and, in the other direction, a
// boolean flipped back on would make every paused day claimable at once.
//
// To run a new campaign: append a window to BOUNTY_CAMPAIGNS. Never edit or
// remove a window that has already been played.
// ─────────────────────────────────────────────────────────────────────────────

/** A paying window, half-open: `from` pays, `until` is the first day that does not. */
export type BountyCampaign = {
  /** First UTC day that pays, `YYYY-MM-DD`. */
  readonly from: string;
  /** First UTC day AFTER the campaign — exclusive, so the range is [from, until). */
  readonly until: string;
};

/**
 * First UTC day that paid nothing — the day the original open-ended bounty
 * stopped. Everything before it paid, and stays claimable forever.
 */
export const BOUNTY_PAUSED_FROM_DAY = "2026-08-13";

/**
 * Every paying campaign since the pause, oldest first, non-overlapping.
 *
 * Closed campaigns stay in this list verbatim — that is the whole point of the
 * list. Deleting 2026-08-18…27 to "clean up" would tell every winner of those
 * ten days that their day never paid.
 */
export const BOUNTY_CAMPAIGNS: readonly BountyCampaign[] = [
  // The $100 campaign: $10/day for ten days.
  { from: "2026-08-18", until: "2026-08-28" },
  // A three-day sprint, Wed–Fri: $10/day, $30 total.
  { from: "2026-09-02", until: "2026-09-05" },
];

/** ISO UTC day, e.g. "2026-08-13". ISO dates compare correctly as strings. */
export function bountyDayUTC(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The UTC day `days` after `day`. Negative goes backwards. */
function shiftDay(day: string, days: number): string {
  return bountyDayUTC(Date.parse(`${day}T00:00:00Z`) + days * 24 * 60 * 60 * 1000);
}

/** The campaign paying on `day`, or null if that day pays nothing. */
export function bountyCampaignFor(day: string = bountyDayUTC()): BountyCampaign | null {
  return BOUNTY_CAMPAIGNS.find((c) => day >= c.from && day < c.until) ?? null;
}

/** Whether a given UTC day pays no prize. */
export function bountyPausedOn(day: string = bountyDayUTC()): boolean {
  // Before the first pause the bounty ran open-endedly, so every one of those
  // days paid and none of them appear in BOUNTY_CAMPAIGNS.
  if (day < BOUNTY_PAUSED_FROM_DAY) return false;
  return bountyCampaignFor(day) === null;
}

/** Last paying day of a campaign, inclusive — `until` is exclusive. */
export function bountyCampaignLastDay(campaign: BountyCampaign): string {
  return shiftDay(campaign.until, -1);
}

/**
 * The last day that still pays before the next pause begins, so the UI can warn
 * players in advance instead of the prize silently vanishing overnight.
 */
export function bountyIsFinalPayingDay(day: string = bountyDayUTC()): boolean {
  if (bountyPausedOn(day)) return false;
  return bountyPausedOn(shiftDay(day, 1));
}

/**
 * Paying days left in the current campaign, counting today. 0 on a paused day.
 *
 * A short campaign lives or dies on urgency, and "3 days left" is the part of
 * the offer a player acts on — the prize alone reads as permanent.
 */
export function bountyDaysLeftInCampaign(day: string = bountyDayUTC()): number {
  const campaign = bountyCampaignFor(day);
  if (!campaign) return 0;
  return Math.round(
    (Date.parse(`${campaign.until}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / (24 * 60 * 60 * 1000),
  );
}

/** Total paying days in a campaign, for "3 days only" style copy. */
export function bountyCampaignLength(campaign: BountyCampaign): number {
  return Math.round(
    (Date.parse(`${campaign.until}T00:00:00Z`) - Date.parse(`${campaign.from}T00:00:00Z`)) / (24 * 60 * 60 * 1000),
  );
}

/**
 * The first paying day at or after `day`, or null if no campaign is scheduled.
 *
 * What a paused surface should actually announce. The old constant reported the
 * first campaign's start forever, so once that campaign had been and gone the
 * API was telling clients the bounty "resumes" on a day in the past.
 */
export function nextBountyPayingDay(day: string = bountyDayUTC()): string | null {
  if (!bountyPausedOn(day)) return day;
  return BOUNTY_CAMPAIGNS.find((c) => c.from > day)?.from ?? null;
}

/**
 * The most recent day that still paid, at or before `day`.
 *
 * The claim UI has to keep looking back at that day for as long as the pause
 * lasts. Defaulting to "yesterday" was fine while the bounty ran, but the moment
 * yesterday itself falls inside a pause it reports nothing to claim — and an
 * unclaimed prize from the last paying day becomes unreachable in the app even
 * though it is still owed.
 */
export function lastPayingDayAtOrBefore(day: string = bountyDayUTC()): string {
  if (!bountyPausedOn(day)) return day;
  // Walk back through closed campaigns, newest first; if the pause predates
  // every campaign we are in the original one, which ended the open-ended run.
  for (let i = BOUNTY_CAMPAIGNS.length - 1; i >= 0; i--) {
    if (BOUNTY_CAMPAIGNS[i].until <= day) return bountyCampaignLastDay(BOUNTY_CAMPAIGNS[i]);
  }
  return shiftDay(BOUNTY_PAUSED_FROM_DAY, -1);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * e.g. "Sep 4" — one UTC day, for short banner copy.
 *
 * Formatted from a fixed table rather than toLocaleDateString: this renders on
 * both the server and the client, and a locale or ICU difference between them
 * is a hydration mismatch on the landing page.
 */
export function formatBountyShortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${MONTH_ABBR[Number(month) - 1]} ${Number(date)}`;
}

/** e.g. "Sep 2 – Sep 4 UTC" — the campaign window, for posters and banners. */
export function formatBountyCampaignRange(campaign: BountyCampaign): string {
  return `${formatBountyShortDay(campaign.from)} – ${formatBountyShortDay(bountyCampaignLastDay(campaign))} UTC`;
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

/** A player's day, reduced to what decides their position on the board. */
export type RankableBountyRow = {
  address: string;
  points: number;
  /** When this score was first reached, epoch ms. 0 when not recorded. */
  reachedAt: number;
};

/**
 * Put a day's players in prize order.
 *
 * The daily cap means the top of the board TIES: 25 flawless Hard wins plus the
 * loss allowance is 7,600 and nothing can beat it, so every player who gets
 * there holds the same score. Three did on 2026-09-03. Whatever decides those
 * ties is deciding real money.
 *
 * It used to be decided by nothing: standings took Redis's ZRANGE order, which
 * for equal scores is the member string — so first place went to the highest
 * wallet address. Reaching the ceiling first is at least something the player
 * did.
 *
 * Address remains the last resort, DESCENDING, only because that is what
 * ZRANGE was already doing. A tie with no timestamps on either side is a day
 * played before this existed, and reordering those would move prize money
 * between players after the fact — the one thing the campaign rules are most
 * insistent must never happen.
 */
export function orderBountyRows<T extends RankableBountyRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // Unrecorded (0) sorts last, so a player with a timestamp is never beaten
    // by one without.
    const at = a.reachedAt || Number.POSITIVE_INFINITY;
    const bt = b.reachedAt || Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.address < b.address ? 1 : a.address > b.address ? -1 : 0;
  });
}

// Minimum points in the day to qualify for a prize. Without it, on a quiet day
// a single match could take the pool — which rewards showing up at the right
// moment rather than actually competing.
//
// Current campaign: the $10 daily pool is for players who clear 5,000 bounty
// points in that UTC day. Unchanged from the $100 run, so the bar players
// already know does not move under them for a three-day sprint.
export const BOUNTY_MIN_POINTS_TO_WIN = 5000;

export function meetsBountyThreshold(points: number): boolean {
  return points >= BOUNTY_MIN_POINTS_TO_WIN;
}

// A second, separately funded pool split evenly between qualifiers who did NOT
// place in the top 3. It is disabled for the current campaign so the daily
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

/**
 * The raised allowance, and the first UTC day it applies to.
 *
 * Dated rather than a straight edit, for the same reason campaigns are a list:
 * a day already played must keep the rules it was played under. Changing the
 * number in place would move a live board mid-day.
 *
 * It would also not work. The stored slot array is truncated to the allowance
 * at WRITE time, so wins past the old cap earlier in the day were never kept —
 * raising the number mid-afternoon cannot give them back. All it would do is
 * hand five fresh slots to whoever happens to still be playing in the last
 * hours, and nothing to the player who put in the same volume that morning.
 *
 * At 30 the day tops out at 9,100 (30 flawless Hard wins plus the loss
 * allowance), up from 7,600. The 5,000 threshold stays comfortably under it,
 * which is the direction that has to hold — see the note above.
 */
export const BOUNTY_WINS_PER_DAY_RAISED = 30;
export const BOUNTY_WINS_RAISED_FROM_DAY = "2026-09-04";

/** The daily win allowance in force on a given UTC day. */
export function bountyWinsPerDay(day: string): number {
  return day >= BOUNTY_WINS_RAISED_FROM_DAY ? BOUNTY_WINS_PER_DAY_RAISED : BOUNTY_WINS_PER_DAY;
}

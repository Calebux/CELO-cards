// When a wallet first claimed a username.
//
// Usernames themselves are stored without a timestamp ("no expiry — usernames
// are permanent"), so there was no way to answer "how many players joined
// today" — the on-chain signups contract only fires inside the verify-and-claim
// flow, and the leaderboard only sees someone once they finish a match. Both
// miss anyone who signed up and hasn't played yet, which is most of a new
// cohort on any given day.
//
// A sorted set keyed by first-claim time answers it with one ZCOUNT, and keeps
// the history so daily numbers can be compared rather than just observed.

import { redis } from "./redis";

const CLAIMED_KEY = "signups:username-claimed";

// Which surface a wallet plays on. Nothing recorded this before, so "how many
// of our players come from MiniPay" was unanswerable from Redis — the only
// rows that carried it were payout records, where the flag picks USDT over G$.
//
// Surface is treated as a property of the WALLET, not the session: a MiniPay
// wallet is provisioned inside MiniPay and cannot be opened in a desktop
// browser, so the first surface we ever see a wallet on is its surface. The
// hash is written first-sighting-wins (HSETNX) and the per-surface sorted sets
// carry the date, so a daily split is one ZCOUNT — the same shape as above.
const SURFACE_KEY = "signups:surface";
const surfaceSeriesKey = (surface: SignupSurface) => `signups:surface:${surface}`;

export type SignupSurface = "minipay" | "web";

/**
 * Decide the surface for a request. Mirrors the rule the payout routes already
 * use: the client's own `isMiniPay()` is the better signal (it checks
 * `window.ethereum.isMiniPay` before falling back to the user agent), but the
 * user agent alone still catches a client that never sent the flag.
 *
 * Deliberately one-directional — either signal alone marks MiniPay. A caller
 * can therefore only ever overstate MiniPay, never hide it, and this feeds a
 * counter rather than a payment.
 */
export function resolveSignupSurface(userAgent: string | null | undefined, explicit?: boolean): SignupSurface {
  if (explicit === true) return "minipay";
  return /MiniPay/i.test(userAgent ?? "") ? "minipay" : "web";
}

/**
 * Tag a wallet's surface the first time it is ever seen. Later sightings are
 * ignored, so a player who opens the web build once is not reclassified and
 * the daily series cannot double-count them.
 */
export async function recordSignupSurface(
  address: string,
  surface: SignupSurface,
  at: number = Date.now(),
): Promise<void> {
  const addr = address.toLowerCase();
  try {
    const firstSighting = await redis.hsetnx(SURFACE_KEY, addr, surface);
    if (!firstSighting) return;
    await redis.zadd(surfaceSeriesKey(surface), { nx: true }, { score: at, member: addr });
  } catch {
    // Metrics must never fail the request they are attached to.
  }
}

/**
 * Record a wallet's FIRST username claim. Uses NX so renaming later never
 * rewrites the original date — otherwise a player changing their name would
 * silently re-count as a new signup.
 */
export async function recordUsernameClaim(address: string, at: number = Date.now()): Promise<void> {
  try {
    await redis.zadd(CLAIMED_KEY, { nx: true }, { score: at, member: address.toLowerCase() });
  } catch {
    // Metrics must never fail a username claim.
  }
}

export async function countUsernameClaimsSince(since: number): Promise<number> {
  return await redis.zcount(CLAIMED_KEY, since, "+inf").catch(() => 0);
}

export async function countUsernameClaimsBetween(from: number, to: number): Promise<number> {
  return await redis.zcount(CLAIMED_KEY, from, to).catch(() => 0);
}

function startOfUTCDay(at: number): number {
  return Date.parse(`${new Date(at).toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Today, yesterday, and the last 7 days — the shape needed to see a trend. */
export async function getSignupMetrics() {
  const now = Date.now();
  const todayStart = startOfUTCDay(now);
  const dayMs = 24 * 60 * 60 * 1000;

  const [today, yesterday, last7d, last24h, total] = await Promise.all([
    countUsernameClaimsSince(todayStart),
    countUsernameClaimsBetween(todayStart - dayMs, todayStart - 1),
    countUsernameClaimsSince(todayStart - 6 * dayMs),
    countUsernameClaimsSince(now - dayMs),
    countUsernameClaimsSince(0),
  ]);

  return {
    today,
    yesterday,
    last24h,
    last7d,
    // Counting only starts from deployment, so this undercounts existing
    // players. Surfaced so nobody reads it as a lifetime total.
    trackedTotal: total,
  };
}

/**
 * The MiniPay / web split, tagged and dated.
 *
 * Like the signup counters, this starts empty at deployment: the ~4,900 wallets
 * that claimed a username before it shipped carry no tag, and are backfilled
 * only as they come back and reconnect. `tagged` is returned alongside so the
 * split is always read against the number of wallets it actually covers rather
 * than against the whole base.
 */
export async function getSurfaceMetrics() {
  const now = Date.now();
  const todayStart = startOfUTCDay(now);
  const dayMs = 24 * 60 * 60 * 1000;

  const countBetween = async (key: string, from: number, to: number | "+inf") =>
    await redis.zcount(key, from, to).catch(() => 0);

  const [
    minipayTotal, webTotal,
    minipayToday, webToday,
    minipayYesterday, webYesterday,
    minipay7d, web7d,
  ] = await Promise.all([
    redis.zcard(surfaceSeriesKey("minipay")).catch(() => 0),
    redis.zcard(surfaceSeriesKey("web")).catch(() => 0),
    countBetween(surfaceSeriesKey("minipay"), todayStart, "+inf"),
    countBetween(surfaceSeriesKey("web"), todayStart, "+inf"),
    countBetween(surfaceSeriesKey("minipay"), todayStart - dayMs, todayStart - 1),
    countBetween(surfaceSeriesKey("web"), todayStart - dayMs, todayStart - 1),
    countBetween(surfaceSeriesKey("minipay"), todayStart - 6 * dayMs, "+inf"),
    countBetween(surfaceSeriesKey("web"), todayStart - 6 * dayMs, "+inf"),
  ]);

  const tagged = minipayTotal + webTotal;
  return {
    minipay: { total: minipayTotal, today: minipayToday, yesterday: minipayYesterday, last7d: minipay7d },
    web: { total: webTotal, today: webToday, yesterday: webYesterday, last7d: web7d },
    tagged,
    minipayShare: tagged > 0 ? minipayTotal / tagged : 0,
  };
}

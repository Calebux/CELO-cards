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

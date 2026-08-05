// Daily bounty — top 3 players by points in a UTC day each win a fixed prize.
//
// This tracks a SEPARATE daily points bucket rather than reusing the leaderboard's
// cumulative `points`, because a cumulative total would hand the same three
// people the prize every day forever and stop being an incentive after day one.
//
// Payouts are manual: this module decides who is owed, and a human sends it.
// Nothing here can move funds.

import { redis } from "./redis";
import { TREASURY_ADDRESS, TREASURY_MINIPAY_ADDRESS } from "./cusd";
import { privateKeyToAccount } from "viem/accounts";

// Prize config lives in the dependency-free bountyConfig module so client pages
// can announce it without pulling redis/viem in. Re-exported here so server
// callers have a single import.
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  BOUNTY_GDOLLAR_PER_USD,
  bountyParticipationShareUsd,
  bountyPrizeForRank,
  meetsBountyThreshold,
  usdToGdollar,
} from "./bountyConfig";

export {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  BOUNTY_GDOLLAR_PER_USD,
  bountyParticipationShareUsd,
  bountyPrizeForRank,
  meetsBountyThreshold,
  usdToGdollar,
};

// Keep just over a week so recent days can still be reviewed and paid late.
const BOUNTY_TTL_SECONDS = 8 * 24 * 60 * 60;

// ── Anti-farming caps ────────────────────────────────────────────────────────
// Real money against a points total invites farming, and both modes are
// farmable in different ways:
//
// VS House needs no second party at all. Free games are lifetime-limited, but a
// season pass grants unlimited boss matches at up to 200 points each — so for
// the price of one weekly pass a script could play all night and hold every
// prize slot indefinitely. Only the first N boss results each day count toward
// the bounty; play beyond that still scores normally on the leaderboard.
export const HOUSE_RESULTS_COUNTED_PER_DAY = 10;

// PvP is farmable with two wallets you own playing each other: a ranked match
// mints 150 + 25 points regardless of who wins. Capping how many times a single
// pairing can pay out makes that grind worse than simply playing real opponents.
export const PVP_RESULTS_COUNTED_PER_OPPONENT_PER_DAY = 3;

export function bountyDayUTC(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

const pointsKey = (day: string) => `bounty:points:${day}`;
const namesKey = (day: string) => `bounty:names:${day}`;
const houseCountKey = (day: string, addr: string) => `bounty:house:${day}:${addr}`;
const pairCountKey = (day: string, addr: string, opponent: string) =>
  `bounty:pair:${day}:${addr}:${opponent}`;
const paidKey = (day: string) => `bounty:paid:${day}`;

// ── Eligibility ──────────────────────────────────────────────────────────────
// Bot wallets are derived from the BOT_WALLET_* keys already in the server env
// rather than kept as a hand-maintained address list, which would silently drift
// out of date as bots are added.
let excludedCache: Set<string> | null = null;

function excludedAddresses(): Set<string> {
  if (excludedCache) return excludedCache;
  const set = new Set<string>([
    TREASURY_ADDRESS.toLowerCase(),
    TREASURY_MINIPAY_ADDRESS.toLowerCase(),
  ]);
  for (const [name, value] of Object.entries(process.env)) {
    if (!/^BOT_WALLET_\d+$/.test(name) || !value) continue;
    try {
      const key = value.trim();
      set.add(privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`).address.toLowerCase());
    } catch {
      // A malformed key just means that bot isn't excluded by address; skip it.
    }
  }
  excludedCache = set;
  return set;
}

export function isBountyExcluded(address: string): boolean {
  const addr = address.toLowerCase();
  // The display-only leaderboard bots in BOT_PLAYERS share this prefix.
  if (addr.startsWith("0xb071d7a6f3ea")) return true;
  return excludedAddresses().has(addr);
}

// ── Recording ────────────────────────────────────────────────────────────────

export type BountySource =
  | { kind: "house" }
  | { kind: "pvp"; opponent: string | null | undefined };

/**
 * Credit a finished match toward today's bounty. Best-effort and never throws —
 * the bounty must never be able to break match completion.
 *
 * Returns whether the points actually counted, which is useful for ops
 * visibility into how often caps bite.
 */
export async function recordBountyPoints(
  address: string | null | undefined,
  points: number,
  source: BountySource,
  playerName?: string | null,
): Promise<boolean> {
  try {
    if (!address || !Number.isFinite(points) || points <= 0) return false;
    const addr = address.toLowerCase();
    if (isBountyExcluded(addr)) return false;

    const day = bountyDayUTC();

    if (source.kind === "house") {
      const key = houseCountKey(day, addr);
      const counted = await redis.incr(key);
      if (counted === 1) await redis.expire(key, BOUNTY_TTL_SECONDS);
      if (counted > HOUSE_RESULTS_COUNTED_PER_DAY) return false;
    } else {
      const opponent = source.opponent?.toLowerCase();
      // No opponent, playing yourself, or farming against a bot: no bounty credit.
      if (!opponent || opponent === addr || isBountyExcluded(opponent)) return false;
      // Directional, so each player counts their own matches against that
      // opponent and the cap means "matches", not "half a match".
      const key = pairCountKey(day, addr, opponent);
      const counted = await redis.incr(key);
      if (counted === 1) await redis.expire(key, BOUNTY_TTL_SECONDS);
      if (counted > PVP_RESULTS_COUNTED_PER_OPPONENT_PER_DAY) return false;
    }

    const key = pointsKey(day);
    await redis.zincrby(key, points, addr);
    await redis.expire(key, BOUNTY_TTL_SECONDS);

    const trimmed = playerName?.trim();
    if (trimmed) {
      await redis.hset(namesKey(day), { [addr]: trimmed.slice(0, 24) });
      await redis.expire(namesKey(day), BOUNTY_TTL_SECONDS);
    }
    return true;
  } catch {
    return false;
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type BountyStanding = {
  rank: number;
  address: string;
  name: string | null;
  points: number;
  /** Met the daily points threshold, so eligible for a share of the pool. */
  qualified: boolean;
  /** Tiered prize for finishing in the top 3. Zero for everyone else. */
  prizeUsd: number;
  /** Even share of the participation pool — every qualifier gets this. */
  participationUsd: number;
  /** What this player is actually owed for the day. */
  totalUsd: number;
};

export type BountyPaidRecord = {
  paidAt: number;
  by: string;
  note?: string;
  winners: { address: string; points: number; prizeUsd: number }[];
};

/**
 * How many players cleared the threshold today. Needed to size the participation
 * share, which depends on ALL qualifiers — not just the page of standings being
 * displayed.
 */
export async function countBountyQualifiers(day: string = bountyDayUTC()): Promise<number> {
  return await redis
    .zcount(pointsKey(day), BOUNTY_MIN_POINTS_TO_WIN, "+inf")
    .catch(() => 0);
}

export async function getBountyStandings(
  day: string = bountyDayUTC(),
  limit = 25,
): Promise<BountyStanding[]> {
  const raw = await redis
    .zrange<string | number>(pointsKey(day), 0, Math.max(0, limit - 1), { rev: true, withScores: true })
    .catch(() => [] as (string | number)[]);

  // withScores comes back flat: [member, score, member, score, ...]
  const rows: { address: string; points: number }[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    rows.push({ address: String(raw[i]), points: Number(raw[i + 1]) || 0 });
  }

  const names = (await redis.hgetall<Record<string, string>>(namesKey(day)).catch(() => null)) ?? {};
  const qualifierCount = await countBountyQualifiers(day);
  const share = bountyParticipationShareUsd(qualifierCount);

  // Rows are sorted by points descending, so everyone meeting the threshold is
  // a prefix of the list. That means a player below it can never sit above a
  // qualifier and block a prize slot — rank and prize rank are the same number.
  return rows.map((row, index) => {
    const qualified = meetsBountyThreshold(row.points);
    const prizeUsd = qualified ? bountyPrizeForRank(index + 1) : 0;
    const participationUsd = qualified ? share : 0;
    return {
      rank: index + 1,
      address: row.address,
      name: names[row.address] ?? null,
      points: row.points,
      qualified,
      prizeUsd,
      participationUsd,
      totalUsd: Math.round((prizeUsd + participationUsd) * 100) / 100,
    };
  });
}

/**
 * Only players who cleared the daily threshold. On a quiet day this can be
 * fewer than BOUNTY_TOP_N, or empty — in which case the unclaimed share of the
 * pool simply isn't paid out rather than going to someone who didn't compete.
 */
export async function getBountyWinners(day: string = bountyDayUTC()): Promise<BountyStanding[]> {
  const standings = await getBountyStandings(day, BOUNTY_TOP_N);
  return standings.slice(0, BOUNTY_TOP_N).filter((s) => s.qualified);
}

/**
 * Everyone owed anything for the day: the top 3 for their tiered prize, plus
 * every other qualifier for their share of the participation pool. This is what
 * actually gets paid, so it is deliberately not limited to the podium.
 */
export async function getBountyPayouts(day: string = bountyDayUTC()): Promise<BountyStanding[]> {
  const qualifierCount = await countBountyQualifiers(day);
  if (qualifierCount === 0) return [];
  const standings = await getBountyStandings(day, Math.max(qualifierCount, BOUNTY_TOP_N));
  return standings.filter((s) => s.totalUsd > 0);
}

/**
 * One player's standing today, regardless of whether they are on the visible
 * page of the board. The client used to show a locally-computed points total
 * that scores per ROUND, while the bounty scores per completed MATCH — so a
 * player could see 620 on the home screen, believe they had cleared the 500
 * threshold, and be paid nothing. This is the number that decides payment, so
 * it is the number the UI has to show.
 */
export async function getPlayerBountyToday(
  address: string,
  day: string = bountyDayUTC(),
): Promise<{ points: number; rank: number | null; qualified: boolean; prizeUsd: number; participationUsd: number; totalUsd: number }> {
  const addr = address.toLowerCase();
  const points = Number(await redis.zscore(pointsKey(day), addr).catch(() => null)) || 0;
  if (points <= 0) {
    return { points: 0, rank: null, qualified: false, prizeUsd: 0, participationUsd: 0, totalUsd: 0 };
  }
  // Rank = how many players are strictly ahead, plus one. Ties share a rank,
  // which is fine for a progress indicator.
  const ahead = await redis.zcount(pointsKey(day), points + 1, "+inf").catch(() => 0);
  const rank = ahead + 1;
  const qualified = meetsBountyThreshold(points);
  const share = qualified ? bountyParticipationShareUsd(await countBountyQualifiers(day)) : 0;
  const prizeUsd = qualified ? bountyPrizeForRank(rank) : 0;
  return {
    points,
    rank,
    qualified,
    prizeUsd,
    participationUsd: share,
    totalUsd: Math.round((prizeUsd + share) * 100) / 100,
  };
}

export async function getBountyPaid(day: string): Promise<BountyPaidRecord | null> {
  return (await redis.get<BountyPaidRecord>(paidKey(day)).catch(() => null)) ?? null;
}

export async function markBountyPaid(
  day: string,
  by: string,
  winners: BountyStanding[],
  note?: string,
): Promise<BountyPaidRecord> {
  const record: BountyPaidRecord = {
    paidAt: Date.now(),
    by,
    note,
    winners: winners.map((w) => ({ address: w.address, points: w.points, prizeUsd: w.prizeUsd })),
  };
  await redis.set(paidKey(day), record, { ex: 365 * 24 * 60 * 60 });
  return record;
}

/**
 * A day is only safe to pay once it has closed — paying a day still in progress
 * means the standings can still change under you.
 */
export function isBountyDayClosed(day: string): boolean {
  return day < bountyDayUTC();
}

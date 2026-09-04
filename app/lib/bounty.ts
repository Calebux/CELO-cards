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
import { resolveAgentStatus } from "./goodagent-server";

// Prize config lives in the dependency-free bountyConfig module so client pages
// can announce it without pulling redis/viem in. Re-exported here so server
// callers have a single import.
import {
  orderBountyRows,
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  BOUNTY_GDOLLAR_PER_USD,
  BOUNTY_CLAIM_URL,
  BOUNTY_CAMPAIGNS,
  BOUNTY_PAUSED_FROM_DAY,
  BOUNTY_WINS_PER_DAY,
  BOUNTY_WINS_PER_DAY_RAISED,
  BOUNTY_WINS_RAISED_FROM_DAY,
  bountyWinsPerDay,
  HOUSE_LOSS_POINTS_PER_DAY,
  HOUSE_BOSS_WINS_COUNTED_PER_DAY,
  bountyCampaignFor,
  bountyDayUTC,
  bountyDaysLeftInCampaign,
  bountyIsFinalPayingDay,
  bountyParticipationRecipients,
  bountyParticipationShareUsd,
  bountyPausedOn,
  bountyPrizeForRank,
  lastPayingDayAtOrBefore,
  meetsBountyThreshold,
  nextBountyPayingDay,
  usdToGdollar,
} from "./bountyConfig";

export {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  BOUNTY_GDOLLAR_PER_USD,
  BOUNTY_CLAIM_URL,
  BOUNTY_CAMPAIGNS,
  BOUNTY_PAUSED_FROM_DAY,
  bountyCampaignFor,
  bountyDayUTC,
  bountyDaysLeftInCampaign,
  bountyIsFinalPayingDay,
  bountyParticipationRecipients,
  bountyParticipationShareUsd,
  bountyPausedOn,
  bountyPrizeForRank,
  bountyWinsPerDay,
  BOUNTY_WINS_PER_DAY_RAISED,
  BOUNTY_WINS_RAISED_FROM_DAY,
  lastPayingDayAtOrBefore,
  meetsBountyThreshold,
  nextBountyPayingDay,
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
// Wins are what a farmer needs, so wins are what the allowance limits. Counting
// LOSSES against it punished exactly the players the bounty exists to pull in: a
// 22%-win-rate player burned all ten slots on defeats worth 10 points each and
// became mathematically unable to reach the threshold, with nothing on screen
// saying why.
// The BASE allowance, i.e. the one in force before the raise. It is a constant,
// so it cannot describe a dated change: anything scoring or displaying a
// specific day must call bountyWinsPerDay(day) instead. Kept because the
// invariant tests want the smaller of the two — a threshold reachable under the
// base allowance is reachable under every later one.
export const HOUSE_WINS_COUNTED_PER_DAY = BOUNTY_WINS_PER_DAY;

// Re-exported from bountyConfig so client components can show the ceiling
// without pulling redis into the bundle.
export { HOUSE_LOSS_POINTS_PER_DAY, HOUSE_BOSS_WINS_COUNTED_PER_DAY } from "./bountyConfig";



// Applied from this UTC day onward. Days before it keep the rules they were
// played under, so closed standings and anything already claimed stay fixed.
export const BOSS_WINS_UNCAPPED_FROM_DAY = "2026-08-09";

/**
 * Whether a House win skips the ordinary daily win allowance.
 *
 * `day` is an ISO date, which compares correctly as a string.
 */
export function bossWinIsUncapped(difficulty: number | undefined, day: string): boolean {
  return difficulty === 3 && day >= BOSS_WINS_UNCAPPED_FROM_DAY;
}

// PvP is farmable with two wallets you own playing each other: a ranked match
// mints 150 + 25 points regardless of who wins. Capping how many times a single
// pairing can pay out makes that grind worse than simply playing real opponents.
export const PVP_RESULTS_COUNTED_PER_OPPONENT_PER_DAY = 3;

const pointsKey = (day: string) => `bounty:points:${day}`;
const namesKey = (day: string) => `bounty:names:${day}`;
const houseWinsKey = (day: string, addr: string) => `bounty:house-wins:${day}:${addr}`;
const houseLossPointsKey = (day: string, addr: string) => `bounty:house-losspts:${day}:${addr}`;
const houseBossWinsKey = (day: string, addr: string) => `bounty:house-bosswins:${day}:${addr}`;

// A player's day is scored from components rather than accumulated in place, so
// that the BEST ten wins count instead of the first ten. Incrementing a running
// total cannot do that: once a win is added it can never be displaced by a
// better one later.
const houseWinPtsKey = (day: string, addr: string) => `bounty:house-winpts:${day}:${addr}`;
const houseBossPtsKey = (day: string, addr: string) => `bounty:house-bosspts:${day}:${addr}`;
const pvpPointsKey = (day: string, addr: string) => `bounty:pvp-pts:${day}:${addr}`;
// Points earned before this scoring model existed, or from matches too old to
// be reconstructed. Without it, switching to component scoring would wipe
// whatever a player had already banked today.
const carryOverKey = (day: string, addr: string) => `bounty:carryover:${day}:${addr}`;
// When the player's total last went UP. Ties at the daily ceiling are decided
// on this: whoever got there first ranks higher. Only written on an increase,
// so playing on past the cap — which cannot raise the total — does not push a
// player down the board for continuing to play.
const reachedKey = (day: string, addr: string) => `bounty:reached:${day}:${addr}`;
const pairCountKey = (day: string, addr: string, opponent: string) =>
  `bounty:pair:${day}:${addr}:${opponent}`;
const paidKey = (day: string) => `bounty:paid:${day}`;
const snapshotKey = (day: string) => `bounty:snapshot:${day}`;

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
  // `difficulty` is the tier the AI actually played at, not the one the match
  // was started on — tier 3 is the House Boss and is exempt from the win cap.
  | { kind: "house"; won: boolean; difficulty?: number }
  | { kind: "pvp"; opponent: string | null | undefined };

/**
 * Credit a finished match toward today's bounty. Best-effort and never throws —
 * the bounty must never be able to break match completion.
 *
 * Returns whether the points actually counted, which is useful for ops
 * visibility into how often caps bite.
 */
/** Sum of the best win values counted on `day`. */
export function bestWinPointsTotal(winPoints: readonly number[], day: string = bountyDayUTC()): number {
  return [...winPoints]
    .sort((a, b) => b - a)
    .slice(0, bountyWinsPerDay(day))
    .reduce((sum, n) => sum + n, 0);
}

/**
 * Recompute and store a player's total for the day from its parts.
 *
 * Components are each written atomically, so a recompute can only ever be a
 * little stale rather than wrong — the next result corrects it.
 */
async function recomputeDayTotal(day: string, addr: string): Promise<number> {
  const [winPts, bossPts, lossPts, pvpPts, carry] = await Promise.all([
    redis.get<number[]>(houseWinPtsKey(day, addr)).catch(() => null),
    redis.get<number>(houseBossPtsKey(day, addr)).catch(() => null),
    redis.get<number>(houseLossPointsKey(day, addr)).catch(() => null),
    redis.get<number>(pvpPointsKey(day, addr)).catch(() => null),
    redis.get<number>(carryOverKey(day, addr)).catch(() => null),
  ]);
  const total =
    (Number(carry) || 0) +
    bestWinPointsTotal(Array.isArray(winPts) ? winPts : [], day) +
    (Number(bossPts) || 0) +
    (Number(lossPts) || 0) +
    (Number(pvpPts) || 0);

  const previous = Number(await redis.zscore(pointsKey(day), addr).catch(() => null)) || 0;
  await redis.zadd(pointsKey(day), {}, { score: total, member: addr });
  await redis.expire(pointsKey(day), BOUNTY_TTL_SECONDS);
  if (total > previous) {
    await redis.set(reachedKey(day, addr), Date.now(), { ex: BOUNTY_TTL_SECONDS }).catch(() => {});
  }
  return total;
}

/**
 * Preserve anything already banked today before components take over.
 *
 * Runs once per player per day. On a day that started under the old running
 * total, the existing score becomes the carry-over so nobody loses points at
 * the moment the scoring model changes.
 */
async function ensureCarryOver(day: string, addr: string): Promise<void> {
  const existing = await redis.get<number>(carryOverKey(day, addr)).catch(() => null);
  if (existing !== null && existing !== undefined) return;
  const banked = Number(await redis.zscore(pointsKey(day), addr).catch(() => null)) || 0;
  await redis.set(carryOverKey(day, addr), banked, { ex: BOUNTY_TTL_SECONDS });
}

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

    // Agent-operated wallets never score here. Checked at this choke point
    // rather than at each caller so the PvP path is covered by the same rule —
    // this function is the only place a match becomes prize money, and prizes
    // go by rank, so one agent on the board costs a real player a tier.
    //
    // resolveAgentStatus refreshes the registry from the host when it has
    // never seen the wallet, because the agents that never announce
    // themselves to us are exactly the ones that would land here.
    if (await resolveAgentStatus(addr)) return false;

    const day = bountyDayUTC();

    await ensureCarryOver(day, addr);
    let counted = true;

    if (source.kind === "house") {
      if (source.won) {
        if (bossWinIsUncapped(source.difficulty, day)) {
          // Boss fights sit outside the ordinary allowance entirely: they
          // neither consume it nor get blocked once it is spent.
          const countKey = houseBossWinsKey(day, addr);
          const bossWins = await redis.incr(countKey);
          if (bossWins === 1) await redis.expire(countKey, BOUNTY_TTL_SECONDS);
          if (bossWins > HOUSE_BOSS_WINS_COUNTED_PER_DAY) return false;
          await redis.incrby(houseBossPtsKey(day, addr), points);
          await redis.expire(houseBossPtsKey(day, addr), BOUNTY_TTL_SECONDS);
        } else {
          // Kept as the best ten win values rather than a count, so a later,
          // better win displaces an earlier, weaker one.
          //
          // Counting the FIRST ten punished exactly the behaviour the tiers are
          // meant to encourage: warm up on Easy, switch to Hard, and every Hard
          // win is worth nothing because the allowance is already spent. Storing
          // only the top ten also keeps this bounded no matter how much is played.
          const winsKey = houseWinsKey(day, addr);
          const played = await redis.incr(winsKey);
          if (played === 1) await redis.expire(winsKey, BOUNTY_TTL_SECONDS);

          const key = houseWinPtsKey(day, addr);
          const kept = (await redis.get<number[]>(key).catch(() => null)) ?? [];
          const before = bestWinPointsTotal(kept, day);
          const next = [...kept, points]
            .sort((a, b) => b - a)
            .slice(0, bountyWinsPerDay(day));
          await redis.set(key, next, { ex: BOUNTY_TTL_SECONDS });
          // Only false when the win could not beat any of the ten already held.
          counted = bestWinPointsTotal(next, day) > before;
        }
      } else {
        // Track loss POINTS rather than loss count, so the ceiling holds even if
        // participation scoring changes later.
        const key = houseLossPointsKey(day, addr);
        const soFar = Number(await redis.get<number>(key).catch(() => 0)) || 0;
        if (soFar >= HOUSE_LOSS_POINTS_PER_DAY) return false;
        await redis.set(key, Math.min(HOUSE_LOSS_POINTS_PER_DAY, soFar + points), { ex: BOUNTY_TTL_SECONDS });
      }
    } else {
      const opponent = source.opponent?.toLowerCase();
      // No opponent, playing yourself, or farming against a bot: no bounty credit.
      if (!opponent || opponent === addr || isBountyExcluded(opponent)) return false;
      // Directional, so each player counts their own matches against that
      // opponent and the cap means "matches", not "half a match".
      const key = pairCountKey(day, addr, opponent);
      const pairResults = await redis.incr(key);
      if (pairResults === 1) await redis.expire(key, BOUNTY_TTL_SECONDS);
      if (pairResults > PVP_RESULTS_COUNTED_PER_OPPONENT_PER_DAY) return false;
      await redis.incrby(pvpPointsKey(day, addr), points);
      await redis.expire(pvpPointsKey(day, addr), BOUNTY_TTL_SECONDS);
    }

    await recomputeDayTotal(day, addr);

    const trimmed = playerName?.trim();
    if (trimmed) {
      await redis.hset(namesKey(day), { [addr]: trimmed.slice(0, 24) });
      await redis.expire(namesKey(day), BOUNTY_TTL_SECONDS);
    }
    return counted;
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

  const reachedAt = await Promise.all(
    rows.map((r) => redis.get<number>(reachedKey(day, r.address)).catch(() => null)),
  );
  const ordered = orderBountyRows(
    rows.map((r, i) => ({ ...r, reachedAt: Number(reachedAt[i]) || 0 })),
  );

  const names = (await redis.hgetall<Record<string, string>>(namesKey(day)).catch(() => null)) ?? {};
  const qualifierCount = await countBountyQualifiers(day);
  const share = bountyParticipationShareUsd(bountyParticipationRecipients(qualifierCount));
  // A paused day still ranks players — the board keeps running — but nothing on
  // it is owed. Everything that decides a payout reads through here, so zeroing
  // the money once covers standings, payouts, snapshots and claims alike.
  const paused = bountyPausedOn(day);

  // Rows are sorted by points descending, so everyone meeting the threshold is
  // a prefix of the list. That means a player below it can never sit above a
  // qualifier and block a prize slot — rank and prize rank are the same number.
  return ordered.map((row, index) => {
    const qualified = meetsBountyThreshold(row.points);
    const rank = index + 1;
    const prizeUsd = qualified && !paused ? bountyPrizeForRank(rank) : 0;
    // Podium finishers take the tiered prize only — the participation pool is
    // for players who turned up without placing.
    const participationUsd = qualified && !paused && rank > BOUNTY_TOP_N ? share : 0;
    return {
      rank,
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
): Promise<{
  points: number; rank: number | null; qualified: boolean; paused: boolean;
  prizeUsd: number; participationUsd: number; totalUsd: number;
  winsUsed: number; winsAllowed: number;
  /** How many of the day's best-win slots are filled, 0..winsAllowed. */
  slotsFilled: number;
  /**
   * The weakest win currently held, once every slot is full — a new win has to
   * BEAT this to move the total at all. Null while slots remain, because
   * anything still counts then.
   *
   * This is the number players keep asking about: with the slots full and every
   * win worth the same, each new win ties instead of beating and the score sits
   * still. Nothing on the board said so, so it read as the game being broken.
   */
  floorPoints: number | null;
}> {
  const addr = address.toLowerCase();
  const paused = bountyPausedOn(day);
  const points = Number(await redis.zscore(pointsKey(day), addr).catch(() => null)) || 0;
  if (points <= 0) {
    return {
      points: 0, rank: null, qualified: false, paused,
      prizeUsd: 0, participationUsd: 0, totalUsd: 0,
      winsUsed: 0, winsAllowed: bountyWinsPerDay(day),
      slotsFilled: 0, floorPoints: null,
    };
  }
  // Rank must match the board exactly, because this is the number the player is
  // shown and the board is the number that gets paid.
  //
  // It used to be "players strictly ahead, plus one", which gives every tied
  // player the same rank. With three players tied at the ceiling on a paying
  // day, all three were told rank 1 and a $5 prize out of a $10 pool — two of
  // them were going to be paid $3 and $2 having been shown $5.
  //
  // Only the tied group is read, so this stays cheap: everyone ahead is counted
  // with ZCOUNT, and position within the tie comes from the same ordering the
  // board uses.
  const winsUsed = Number(await redis.get<number>(houseWinsKey(day, addr)).catch(() => 0)) || 0;
  const winSlots = (await redis.get<number[]>(houseWinPtsKey(day, addr)).catch(() => null)) ?? [];
  const winsAllowed = bountyWinsPerDay(day);
  const slotsFilled = Math.min(winSlots.length, winsAllowed);
  const floorPoints = slotsFilled >= winsAllowed ? Math.min(...winSlots) : null;
  const ahead = await redis.zcount(pointsKey(day), points + 1, "+inf").catch(() => 0);
  // Everyone on exactly this score occupies the slice straight after those
  // ahead of it, so the tied group is reachable by index without a by-score
  // query the redis wrapper does not expose.
  const tieCount = await redis.zcount(pointsKey(day), points, points).catch(() => 1);
  const tiedWith = tieCount > 1
    ? await redis
        .zrange<string>(pointsKey(day), ahead, ahead + tieCount - 1, { rev: true })
        .catch(() => [addr])
    : [addr];
  const tiedRows = await Promise.all(
    (tiedWith ?? [addr]).map(async (member) => ({
      address: String(member),
      points,
      reachedAt: Number(await redis.get<number>(reachedKey(day, String(member))).catch(() => null)) || 0,
    })),
  );
  const positionInTie = orderBountyRows(tiedRows).findIndex((r) => r.address === addr);
  const rank = ahead + (positionInTie >= 0 ? positionInTie : 0) + 1;
  const qualified = meetsBountyThreshold(points);
  const share = qualified && !paused && rank > BOUNTY_TOP_N
    ? bountyParticipationShareUsd(bountyParticipationRecipients(await countBountyQualifiers(day)))
    : 0;
  const prizeUsd = qualified && !paused ? bountyPrizeForRank(rank) : 0;
  return {
    points,
    rank,
    qualified,
    paused,
    prizeUsd,
    participationUsd: share,
    totalUsd: Math.round((prizeUsd + share) * 100) / 100,
    winsUsed,
    winsAllowed,
    slotsFilled,
    floorPoints,
  };
}

/**
 * Freeze a closed day's result so it survives the 8-day working TTL.
 *
 * The live points bucket expires — it has to, or every day's keys accumulate
 * forever — but the record of who was owed what must not. Without a snapshot,
 * a day that goes unpaid for over a week becomes unpayable because there is no
 * longer any record of who won it. Idempotent, so it can be called repeatedly.
 */
export async function snapshotBountyDay(day: string): Promise<BountyStanding[]> {
  const existing = await redis.get<BountyStanding[]>(snapshotKey(day)).catch(() => null);
  if (existing?.length) return existing;

  const payouts = await getBountyPayouts(day);
  if (payouts.length) {
    // Kept for a year: long enough that a forgotten day is still auditable.
    await redis.set(snapshotKey(day), payouts, { ex: 365 * 24 * 60 * 60 });
  }
  return payouts;
}

/** A closed day's winners, from the snapshot if the live keys have expired. */
export async function getBountyDayResult(day: string): Promise<BountyStanding[]> {
  const snap = await redis.get<BountyStanding[]>(snapshotKey(day)).catch(() => null);
  if (snap?.length) return snap;
  return getBountyPayouts(day);
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

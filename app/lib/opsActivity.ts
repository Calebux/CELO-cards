import { CARDS, CHARACTERS } from "./gameData";
import { redis } from "./redis";

const HOUSE_MATCHES_KEY = "ops:activity:house_matches";
const HOUSE_WINNER_REWARDS_KEY = "ops:activity:house_winner_rewards";
const BLACK_MARKET_PURCHASES_KEY = "ops:activity:black_market_purchases";
const AUTH_FAILURES_KEY = "ops:activity:auth_failures";
const ACTIVITY_TTL_SECONDS = 60 * 60 * 24 * 180;

// A hundred entries was roughly three hours of history for the WHOLE game, and
// one busy player could hold a third of it. Runs were ageing out before their
// own prize claim could be verified.
//
// Raising it is only safe because the append below no longer rewrites the whole
// array — see appendActivity.
const MAX_ACTIVITY_ITEMS = 2000;

// Every player also gets their own list. The global feed is ordered by time, so
// a player's history is only ever as long as the quietest stretch of everyone
// else's — on a busy night that is minutes. Anything reasoning about ONE
// player's run reads this instead and is unaffected by how much anyone else is
// playing.
const MAX_PLAYER_ITEMS = 200;
const playerMatchesKey = (address: string) => `ops:activity:house_matches:p:${address.toLowerCase()}`;

// The list-backed keys. The originals held a single JSON array, which is a
// different Redis type — writing a list to them would fail with WRONGTYPE — so
// the new data lives beside the old and readers merge the two until the old
// window has aged out. Every feed moves together: appendActivity now writes
// lists, so a reader still calling GET on the old key would see nothing.
const HOUSE_MATCHES_LIST_KEY = `${HOUSE_MATCHES_KEY}:list`;
const HOUSE_WINNER_REWARDS_LIST_KEY = `${HOUSE_WINNER_REWARDS_KEY}:list`;
const BLACK_MARKET_PURCHASES_LIST_KEY = `${BLACK_MARKET_PURCHASES_KEY}:list`;
const AUTH_FAILURES_LIST_KEY = `${AUTH_FAILURES_KEY}:list`;

export type HouseMatchActivity = {
  matchId: string;
  playerAddress: string;
  playerName: string | null;
  playerCharacterId: string;
  opponentCharacterId: string;
  /** Effective difficulty the AI played at, including chamber escalation. */
  difficulty: number;
  /**
   * The tier the player SELECTED. The chamber forces difficulty 3 for its final
   * rounds whatever was chosen, so the effective value says nothing about how
   * hard the player opted to make it — and the House Boss prize is meant to
   * reward choosing Hard.
   */
  chosenDifficulty?: number;
  wagered: boolean;
  outcome: "win" | "loss";
  pointsEarned: number;
  playerRoundsWon: number;
  opponentRoundsWon: number;
  completedAt: number;
};

export type HouseWinnerRewardActivity = {
  matchId: string;
  playerAddress: string;
  playerName: string | null;
  playerCharacterId: string;
  opponentCharacterId: string;
  rewardCode: string;
  rewardUsd: number;
  verifiedAt: number;
  // "pending" = win recorded from (forgeable) VS House telemetry but not yet
  // manually verified; only "verified" rewards carry a real redeemable code
  // and appear in the public showcase (M-07). Absent on legacy entries → treated
  // as unverified.
  status?: "verified" | "pending";
};

export type BlackMarketPurchaseActivity = {
  address: string;
  playerName: string | null;
  cardId: string;
  cardName: string;
  currency: "celo" | "gdollar" | "usdt" | "usdc" | "cusd";
  pricePoints: number;
  txHash: string;
  purchasedAt: number;
};

// A failed sign-in used to leave no trace at all, so every auth bug had to be
// diagnosed by reading code. Deliberately carries no address or user-agent —
// only what is needed to tell failure modes apart.
export type AuthFailureActivity = {
  stage: "sign-in" | "resume" | "init";
  reason: string;
  device: string;
  redirectMode: boolean;
  /** Present for resume reports: how long it took before it landed or gave up. */
  durationMs?: number;
  failedAt: number;
};

/**
 * Append to a capped, newest-first list.
 *
 * This used to read the whole array, prepend, and write it all back. That made
 * the cap expensive to raise — every match paid for the entire history twice
 * over the wire — and it lost writes: two matches finishing together both read
 * the same array and the second overwrote the first. LPUSH is O(1), atomic, and
 * indifferent to how long the list is.
 */
async function appendActivity<T>(key: string, entry: T, cap = MAX_ACTIVITY_ITEMS): Promise<void> {
  await redis.lpush(key, JSON.stringify(entry));
  await redis.ltrim(key, 0, cap - 1);
  await redis.expire(key, ACTIVITY_TTL_SECONDS);
}

/**
 * Read a list written by appendActivity.
 *
 * Upstash decodes JSON element values on the way out, so entries arrive as
 * objects already; a string means it did not, and it is parsed here. Anything
 * unreadable is dropped rather than failing the whole read — one malformed
 * entry must not hide the rest of the history.
 */
async function readActivityList<T>(key: string, limit: number): Promise<T[]> {
  const raw = await redis.lrange<unknown>(key, 0, Math.max(0, limit - 1)).catch(() => []);
  const out: T[] = [];
  for (const item of raw ?? []) {
    if (typeof item === "string") {
      try { out.push(JSON.parse(item) as T); } catch { /* skip */ }
    } else if (item && typeof item === "object") {
      out.push(item as T);
    }
  }
  return out;
}

/**
 * List plus whatever the pre-switch JSON array still holds, newest first.
 *
 * `identity` keeps an entry from appearing twice while both stores overlap;
 * `timestamp` orders the union. Once the legacy key expires this is just the
 * list.
 */
async function readMergedActivity<T>(
  listKey: string,
  legacyKey: string,
  limit: number,
  identity: (entry: T) => string,
  timestamp: (entry: T) => number,
): Promise<T[]> {
  const [list, legacy] = await Promise.all([
    readActivityList<T>(listKey, limit),
    redis.get<T[]>(legacyKey).catch(() => null),
  ]);
  if (!legacy?.length) return list;
  const seen = new Set(list.map(identity));
  const merged = [...list];
  for (const entry of legacy) {
    if (!seen.has(identity(entry))) merged.push(entry);
  }
  return merged.sort((a, b) => timestamp(b) - timestamp(a)).slice(0, limit);
}

export async function recordHouseMatchActivity(entry: HouseMatchActivity): Promise<void> {
  // Written to both the global feed and the player's own list. The per-player
  // copy is what prize verification reads, so a run stays provable however busy
  // the rest of the game is.
  await Promise.all([
    appendActivity(HOUSE_MATCHES_LIST_KEY, entry),
    appendActivity(playerMatchesKey(entry.playerAddress), entry, MAX_PLAYER_ITEMS),
  ]);
}

/**
 * One player's own match history, newest first.
 *
 * Falls back to filtering the global feed when the player has no list yet,
 * which covers matches played before this existed — without it, a claim made
 * moments after deploy would find no history and be refused.
 */
export async function getPlayerHouseMatchActivity(
  address: string,
  limit = MAX_PLAYER_ITEMS,
): Promise<HouseMatchActivity[]> {
  const own = await readActivityList<HouseMatchActivity>(playerMatchesKey(address), limit);
  if (own.length > 0) return own;
  const addr = address.toLowerCase();
  return (await getHouseMatchActivity())
    .filter((m) => m.playerAddress.toLowerCase() === addr)
    .slice(0, limit);
}

export async function recordHouseWinnerRewardActivity(entry: HouseWinnerRewardActivity): Promise<void> {
  await appendActivity(HOUSE_WINNER_REWARDS_LIST_KEY, entry);
}

export async function recordBlackMarketPurchaseActivity(entry: BlackMarketPurchaseActivity): Promise<void> {
  await appendActivity(BLACK_MARKET_PURCHASES_LIST_KEY, entry);
}

export async function getHouseMatchActivity(limit = MAX_ACTIVITY_ITEMS): Promise<HouseMatchActivity[]> {
  return readMergedActivity<HouseMatchActivity>(
    HOUSE_MATCHES_LIST_KEY, HOUSE_MATCHES_KEY, limit,
    (m) => `${m.matchId}:${m.completedAt}`, (m) => m.completedAt ?? 0,
  );
}

export async function getHouseWinnerRewardActivity(limit = MAX_ACTIVITY_ITEMS): Promise<HouseWinnerRewardActivity[]> {
  return readMergedActivity<HouseWinnerRewardActivity>(
    HOUSE_WINNER_REWARDS_LIST_KEY, HOUSE_WINNER_REWARDS_KEY, limit,
    (r) => `${r.matchId}:${r.playerAddress}`, (r) => r.verifiedAt ?? 0,
  );
}

export async function getBlackMarketPurchaseActivity(limit = MAX_ACTIVITY_ITEMS): Promise<BlackMarketPurchaseActivity[]> {
  return readMergedActivity<BlackMarketPurchaseActivity>(
    BLACK_MARKET_PURCHASES_LIST_KEY, BLACK_MARKET_PURCHASES_KEY, limit,
    (p) => `${p.txHash}:${p.cardId}`, (p) => p.purchasedAt ?? 0,
  );
}

export async function recordAuthFailureActivity(entry: AuthFailureActivity): Promise<void> {
  await appendActivity(AUTH_FAILURES_LIST_KEY, entry);
}

export async function getAuthFailureActivity(limit = MAX_ACTIVITY_ITEMS): Promise<AuthFailureActivity[]> {
  return readMergedActivity<AuthFailureActivity>(
    AUTH_FAILURES_LIST_KEY, AUTH_FAILURES_KEY, limit,
    (f) => `${f.failedAt}:${f.stage}:${f.reason}`, (f) => f.failedAt ?? 0,
  );
}

/** Failure counts grouped by reason and by device, newest window first. */
export function summariseAuthFailures(entries: AuthFailureActivity[]) {
  const byReason: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let last24h = 0;

  for (const entry of entries) {
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
    byDevice[entry.device] = (byDevice[entry.device] ?? 0) + 1;
    byStage[entry.stage] = (byStage[entry.stage] ?? 0) + 1;
    if (entry.failedAt >= dayAgo) last24h++;
  }

  // Resume timings are the point: a resume that succeeds after the user has
  // already tapped SIGN IN is still a failed experience.
  const resumeMs = entries
    .filter((e) => e.stage === "resume" && typeof e.durationMs === "number")
    .map((e) => e.durationMs as number)
    .sort((a, b) => a - b);
  const medianResumeMs = resumeMs.length
    ? resumeMs[Math.floor(resumeMs.length / 2)]
    : null;
  const slowResumes = resumeMs.filter((ms) => ms > 3000).length;

  return {
    total: entries.length,
    last24h,
    byReason,
    byDevice,
    byStage,
    resumeSamples: resumeMs.length,
    medianResumeMs,
    // Over ~3s people stop waiting and tap, which is the reported complaint.
    resumesSlowerThan3s: slowResumes,
  };
}

export async function getOpsActivitySnapshot() {
  const [houseMatches, houseWinnerRewards, purchases, authFailures] = await Promise.all([
    getHouseMatchActivity(),
    getHouseWinnerRewardActivity(),
    getBlackMarketPurchaseActivity(),
    getAuthFailureActivity(),
  ]);

  const houseWins = houseMatches.filter((match) => match.outcome === "win").length;
  const housePoints = houseMatches.reduce((sum, match) => sum + match.pointsEarned, 0);
  const purchaseBuyers = new Set(purchases.map((purchase) => purchase.address.toLowerCase()));
  const gdollarPurchases = purchases.filter((purchase) => purchase.currency === "gdollar").length;
  const usdtPurchases = purchases.filter((purchase) => purchase.currency === "usdt").length;
  const celoPurchases = purchases.filter((purchase) => purchase.currency === "celo").length;
  const purchaseRevenuePoints = purchases.reduce((sum, purchase) => sum + purchase.pricePoints, 0);

  const recentHouseMatches = houseMatches.slice(0, 12).map((match) => {
    const playerCharacter = CHARACTERS.find((character) => character.id === match.playerCharacterId);
    const opponentCharacter = CHARACTERS.find((character) => character.id === match.opponentCharacterId);
    return {
      ...match,
      playerCharacterName: playerCharacter?.name ?? match.playerCharacterId,
      opponentCharacterName: opponentCharacter?.name ?? match.opponentCharacterId,
    };
  });

  const recentHouseWinnerRewards = houseWinnerRewards.slice(0, 12).map((reward) => {
    const playerCharacter = CHARACTERS.find((character) => character.id === reward.playerCharacterId);
    const opponentCharacter = CHARACTERS.find((character) => character.id === reward.opponentCharacterId);
    return {
      ...reward,
      playerCharacterName: playerCharacter?.name ?? reward.playerCharacterId,
      opponentCharacterName: opponentCharacter?.name ?? reward.opponentCharacterId,
    };
  });

  const recentBlackMarketPurchases = purchases.slice(0, 12).map((purchase) => {
    const card = CARDS.find((item) => item.id === purchase.cardId);
    return {
      ...purchase,
      cardName: card?.name ?? purchase.cardName,
    };
  });

  return {
    house: {
      totalMatches: houseMatches.length,
      winRate: houseMatches.length > 0 ? houseWins / houseMatches.length : 0,
      wageredMatches: houseMatches.filter((match) => match.wagered).length,
      averagePointsEarned: houseMatches.length > 0 ? housePoints / houseMatches.length : 0,
      recentMatches: recentHouseMatches,
      winnerRewardsIssued: houseWinnerRewards.length,
      winnerRewardUsdTotal: houseWinnerRewards.reduce((sum, reward) => sum + reward.rewardUsd, 0),
      recentWinnerRewards: recentHouseWinnerRewards,
    },
    blackMarket: {
      totalPurchases: purchases.length,
      uniqueBuyers: purchaseBuyers.size,
      gdollarPurchases,
      usdtPurchases,
      celoPurchases,
      revenuePoints: purchaseRevenuePoints,
      recentPurchases: recentBlackMarketPurchases,
    },
    auth: {
      ...summariseAuthFailures(authFailures),
      recentFailures: authFailures.slice(0, 20),
    },
  };
}

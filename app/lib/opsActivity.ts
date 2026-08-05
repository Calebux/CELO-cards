import { CARDS, CHARACTERS } from "./gameData";
import { redis } from "./redis";

const HOUSE_MATCHES_KEY = "ops:activity:house_matches";
const HOUSE_WINNER_REWARDS_KEY = "ops:activity:house_winner_rewards";
const BLACK_MARKET_PURCHASES_KEY = "ops:activity:black_market_purchases";
const AUTH_FAILURES_KEY = "ops:activity:auth_failures";
const ACTIVITY_TTL_SECONDS = 60 * 60 * 24 * 180;
const MAX_ACTIVITY_ITEMS = 100;

export type HouseMatchActivity = {
  matchId: string;
  playerAddress: string;
  playerName: string | null;
  playerCharacterId: string;
  opponentCharacterId: string;
  difficulty: number;
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

async function appendActivity<T>(key: string, entry: T): Promise<void> {
  const existing = (await redis.get<T[]>(key)) ?? [];
  const updated = [entry, ...existing].slice(0, MAX_ACTIVITY_ITEMS);
  await redis.set(key, updated, { ex: ACTIVITY_TTL_SECONDS });
}

export async function recordHouseMatchActivity(entry: HouseMatchActivity): Promise<void> {
  await appendActivity(HOUSE_MATCHES_KEY, entry);
}

export async function recordHouseWinnerRewardActivity(entry: HouseWinnerRewardActivity): Promise<void> {
  await appendActivity(HOUSE_WINNER_REWARDS_KEY, entry);
}

export async function recordBlackMarketPurchaseActivity(entry: BlackMarketPurchaseActivity): Promise<void> {
  await appendActivity(BLACK_MARKET_PURCHASES_KEY, entry);
}

export async function getHouseMatchActivity(): Promise<HouseMatchActivity[]> {
  return (await redis.get<HouseMatchActivity[]>(HOUSE_MATCHES_KEY)) ?? [];
}

export async function getHouseWinnerRewardActivity(): Promise<HouseWinnerRewardActivity[]> {
  return (await redis.get<HouseWinnerRewardActivity[]>(HOUSE_WINNER_REWARDS_KEY)) ?? [];
}

export async function getBlackMarketPurchaseActivity(): Promise<BlackMarketPurchaseActivity[]> {
  return (await redis.get<BlackMarketPurchaseActivity[]>(BLACK_MARKET_PURCHASES_KEY)) ?? [];
}

export async function recordAuthFailureActivity(entry: AuthFailureActivity): Promise<void> {
  await appendActivity(AUTH_FAILURES_KEY, entry);
}

export async function getAuthFailureActivity(): Promise<AuthFailureActivity[]> {
  return (await redis.get<AuthFailureActivity[]>(AUTH_FAILURES_KEY)) ?? [];
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

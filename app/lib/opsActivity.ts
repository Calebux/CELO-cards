import { CARDS, CHARACTERS } from "./gameData";
import { redis } from "./redis";

const HOUSE_MATCHES_KEY = "ops:activity:house_matches";
const BLACK_MARKET_PURCHASES_KEY = "ops:activity:black_market_purchases";
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

export type BlackMarketPurchaseActivity = {
  address: string;
  playerName: string | null;
  cardId: string;
  cardName: string;
  currency: "celo" | "gdollar";
  pricePoints: number;
  txHash: string;
  purchasedAt: number;
};

async function appendActivity<T>(key: string, entry: T): Promise<void> {
  const existing = (await redis.get<T[]>(key)) ?? [];
  const updated = [entry, ...existing].slice(0, MAX_ACTIVITY_ITEMS);
  await redis.set(key, updated, { ex: ACTIVITY_TTL_SECONDS });
}

export async function recordHouseMatchActivity(entry: HouseMatchActivity): Promise<void> {
  await appendActivity(HOUSE_MATCHES_KEY, entry);
}

export async function recordBlackMarketPurchaseActivity(entry: BlackMarketPurchaseActivity): Promise<void> {
  await appendActivity(BLACK_MARKET_PURCHASES_KEY, entry);
}

export async function getHouseMatchActivity(): Promise<HouseMatchActivity[]> {
  return (await redis.get<HouseMatchActivity[]>(HOUSE_MATCHES_KEY)) ?? [];
}

export async function getBlackMarketPurchaseActivity(): Promise<BlackMarketPurchaseActivity[]> {
  return (await redis.get<BlackMarketPurchaseActivity[]>(BLACK_MARKET_PURCHASES_KEY)) ?? [];
}

export async function getOpsActivitySnapshot() {
  const [houseMatches, purchases] = await Promise.all([
    getHouseMatchActivity(),
    getBlackMarketPurchaseActivity(),
  ]);

  const houseWins = houseMatches.filter((match) => match.outcome === "win").length;
  const housePoints = houseMatches.reduce((sum, match) => sum + match.pointsEarned, 0);
  const purchaseBuyers = new Set(purchases.map((purchase) => purchase.address.toLowerCase()));
  const gdollarPurchases = purchases.filter((purchase) => purchase.currency === "gdollar").length;
  const celoPurchases = purchases.length - gdollarPurchases;
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
    },
    blackMarket: {
      totalPurchases: purchases.length,
      uniqueBuyers: purchaseBuyers.size,
      gdollarPurchases,
      celoPurchases,
      revenuePoints: purchaseRevenuePoints,
      recentPurchases: recentBlackMarketPurchases,
    },
  };
}

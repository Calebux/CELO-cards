import { getRankedDashboardSnapshot, RankedDashboardSnapshot } from "./rankedTelemetry";
import { getBlackMarketPurchaseActivity, getHouseMatchActivity, getOpsActivitySnapshot } from "./opsActivity";
import { readLeaderboard } from "./leaderboard";
import { redis } from "./redis";
import { ServerMatch } from "./serverMatch";

export const BALANCE_POLICY = {
  currentVersion: "Season 1.3",
  patchCadence: {
    micro: "Weekly micro-adjusts",
    major: "Monthly balance pass",
  },
  thresholds: {
    minimumCardSamples: 18,
    highPickRate: 0.12,
    highWinRate: 0.58,
    lowWinRate: 0.42,
  },
};

export type BalanceWatchItem = {
  id: string;
  name: string;
  status: "hot" | "cold" | "stable";
  summary: string;
  pickRate: number;
  winRate: number;
  sample: number;
};

type OpsAudienceMetrics = {
  totalPlayers: number;
  dailyPlayers: number;
  transactions: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addAddress(target: Set<string>, address: string | null | undefined) {
  const normalized = address?.trim().toLowerCase();
  if (normalized && /^0x[0-9a-f]{40}$/.test(normalized)) target.add(normalized);
}

async function scanKeys(pattern: string): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== "0");

  return keys;
}

async function getAudienceMetrics(): Promise<OpsAudienceMetrics> {
  const now = Date.now();
  const dailyCutoff = now - DAY_MS;

  const [
    leaderboard,
    houseMatches,
    purchases,
    seasonPassKeys,
    matchKeys,
  ] = await Promise.all([
    readLeaderboard(),
    getHouseMatchActivity(),
    getBlackMarketPurchaseActivity(),
    scanKeys("season-pass:0x*"),
    scanKeys("match:*"),
  ]);

  const totalPlayers = new Set<string>();
  const dailyPlayers = new Set<string>();
  const transactions = new Set<string>();

  for (const entry of Object.values(leaderboard.casual)) {
    addAddress(totalPlayers, entry.address);
    if (entry.lastSeen >= dailyCutoff) addAddress(dailyPlayers, entry.address);
  }

  for (const entry of Object.values(leaderboard.ranked)) {
    addAddress(totalPlayers, entry.address);
    if (entry.lastSeen >= dailyCutoff) addAddress(dailyPlayers, entry.address);
  }

  for (const match of houseMatches) {
    addAddress(totalPlayers, match.playerAddress);
    if (match.completedAt >= dailyCutoff) addAddress(dailyPlayers, match.playerAddress);
  }

  for (const purchase of purchases) {
    addAddress(totalPlayers, purchase.address);
    if (purchase.purchasedAt >= dailyCutoff) addAddress(dailyPlayers, purchase.address);
    if (purchase.txHash) transactions.add(purchase.txHash.toLowerCase());
  }

  for (const key of seasonPassKeys) {
    addAddress(totalPlayers, key.slice("season-pass:".length));
  }

  const seasonPassTxKeys = await scanKeys("season-pass-tx:*");
  for (const key of seasonPassTxKeys) {
    const txHash = key.slice("season-pass-tx:".length).trim().toLowerCase();
    if (txHash) transactions.add(txHash);
  }

  const matchRecords = await Promise.all(matchKeys.map((key) => redis.get<ServerMatch>(key)));
  for (const match of matchRecords) {
    if (!match) continue;
    addAddress(totalPlayers, match.host.address);
    addAddress(totalPlayers, match.joiner.address);
    if (match.lastActivity >= dailyCutoff) {
      addAddress(dailyPlayers, match.host.address);
      addAddress(dailyPlayers, match.joiner.address);
    }
    if (match.hostWagerTx) transactions.add(match.hostWagerTx.toLowerCase());
    if (match.joinerWagerTx) transactions.add(match.joinerWagerTx.toLowerCase());
  }

  return {
    totalPlayers: totalPlayers.size,
    dailyPlayers: dailyPlayers.size,
    transactions: transactions.size,
  };
}

export function buildBalanceWatchlist(snapshot: RankedDashboardSnapshot): BalanceWatchItem[] {
  return snapshot.topCards
    .map((card) => {
      const hot = card.sample >= BALANCE_POLICY.thresholds.minimumCardSamples &&
        (card.pickRate >= BALANCE_POLICY.thresholds.highPickRate || card.winRate >= BALANCE_POLICY.thresholds.highWinRate);
      const cold = card.sample >= BALANCE_POLICY.thresholds.minimumCardSamples &&
        card.winRate <= BALANCE_POLICY.thresholds.lowWinRate;

      let status: BalanceWatchItem["status"] = "stable";
      let summary = "Within current thresholds.";
      if (hot) {
        status = "hot";
        summary = "Watch for a nerf if this stays over target for another sample window.";
      } else if (cold) {
        status = "cold";
        summary = "Candidate for a buff or matchup relief if the next sample stays low.";
      }

      return {
        id: card.id,
        name: card.name,
        status,
        summary,
        pickRate: card.pickRate,
        winRate: card.winRate,
        sample: card.sample,
      };
    })
    .filter((item) => item.status !== "stable")
    .slice(0, 6);
}

export async function getBalanceDashboard() {
  const [snapshot, activity, audience] = await Promise.all([
    getRankedDashboardSnapshot(),
    getOpsActivitySnapshot(),
    getAudienceMetrics(),
  ]);
  return {
    snapshot,
    policy: BALANCE_POLICY,
    watchlist: buildBalanceWatchlist(snapshot),
    activity,
    audience,
  };
}

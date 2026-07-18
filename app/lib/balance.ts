import { getRankedDashboardSnapshot, RankedDashboardSnapshot } from "./rankedTelemetry";
import { getBlackMarketPurchaseActivity, getHouseMatchActivity, getOpsActivitySnapshot } from "./opsActivity";
import { readLeaderboard } from "./leaderboard";
import { redis } from "./redis";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { SEASON_PASS_CONTRACT, SEASON_PASS_ABI } from "./seasonPassContract";
import { GDOLLAR_SEASON_PASS_CONTRACT, GDOLLAR_SEASON_PASS_ABI } from "./gdollarSeasonPassContract";
import { SIGNUPS_CONTRACT, SIGNUPS_ABI } from "./signupsContract";
import { IDENTITY_CONTRACT, IDENTITY_ABI } from "./gooddollar";
import { isBotWallet } from "./botWallets";
import { getOnChainWallets } from "./onChainWallets";
import { ServerMatch } from "./serverMatch";
import type { ServerMatchRecord } from "./leaderboard";

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
  weeklyPlayers: number;
  monthlyPlayers: number;
  transactions: number;
  transactions24h: number;
  transactions7d: number;
  transactions30d: number;
  trackedVolumeUsdt: number;
  trackedVolumeCelo: number;
  trackedVolumeGdollar: number;
};

type RetentionMetrics = {
  d1Rate: number;
  d7Rate: number;
  d30Rate: number;
  d1Eligible: number;
  d7Eligible: number;
  d30Eligible: number;
};

type TransactionHealthMetrics = {
  sampledTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  failedRate: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TX_HEALTH_CACHE_KEY = "ops:stats:tx-health:v1";
const TX_HEALTH_CACHE_SECONDS = 10 * 60;
const TX_HEALTH_TIMEOUT_MS = 8_000;

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
  const weeklyCutoff = now - 7 * DAY_MS;
  const monthlyCutoff = now - 30 * DAY_MS;

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
  const weeklyPlayers = new Set<string>();
  const monthlyPlayers = new Set<string>();
  const transactions = new Set<string>();
  const transactions24h = new Set<string>();
  const transactions7d = new Set<string>();
  const transactions30d = new Set<string>();
  let trackedVolumeUsdt = 0;
  let trackedVolumeCelo = 0;
  let trackedVolumeGdollar = 0;

  const addTransaction = (txHash: string | null | undefined, timestamp: number) => {
    const normalized = txHash?.trim().toLowerCase();
    if (!normalized) return;
    transactions.add(normalized);
    if (timestamp >= dailyCutoff) transactions24h.add(normalized);
    if (timestamp >= weeklyCutoff) transactions7d.add(normalized);
    if (timestamp >= monthlyCutoff) transactions30d.add(normalized);
  };

  const addTrackedVolume = (currency: string | null | undefined, rawAmount: string | null | undefined) => {
    if (!currency || !rawAmount) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (currency === "usdt") trackedVolumeUsdt += amount / 1_000_000;
    if (currency === "celo") trackedVolumeCelo += amount / 1e18;
    if (currency === "gdollar") trackedVolumeGdollar += amount / 1e18;
    if (currency === "cusd") trackedVolumeUsdt += amount / 1e18;
  };

  for (const entry of Object.values(leaderboard.casual)) {
    addAddress(totalPlayers, entry.address);
    if (entry.lastSeen >= dailyCutoff) addAddress(dailyPlayers, entry.address);
    if (entry.lastSeen >= weeklyCutoff) addAddress(weeklyPlayers, entry.address);
    if (entry.lastSeen >= monthlyCutoff) addAddress(monthlyPlayers, entry.address);
  }

  for (const entry of Object.values(leaderboard.ranked)) {
    addAddress(totalPlayers, entry.address);
    if (entry.lastSeen >= dailyCutoff) addAddress(dailyPlayers, entry.address);
    if (entry.lastSeen >= weeklyCutoff) addAddress(weeklyPlayers, entry.address);
    if (entry.lastSeen >= monthlyCutoff) addAddress(monthlyPlayers, entry.address);
  }

  for (const match of houseMatches) {
    addAddress(totalPlayers, match.playerAddress);
    if (match.completedAt >= dailyCutoff) addAddress(dailyPlayers, match.playerAddress);
    if (match.completedAt >= weeklyCutoff) addAddress(weeklyPlayers, match.playerAddress);
    if (match.completedAt >= monthlyCutoff) addAddress(monthlyPlayers, match.playerAddress);
  }

  for (const purchase of purchases) {
    addAddress(totalPlayers, purchase.address);
    if (purchase.purchasedAt >= dailyCutoff) addAddress(dailyPlayers, purchase.address);
    if (purchase.purchasedAt >= weeklyCutoff) addAddress(weeklyPlayers, purchase.address);
    if (purchase.purchasedAt >= monthlyCutoff) addAddress(monthlyPlayers, purchase.address);
    addTransaction(purchase.txHash, purchase.purchasedAt);
    if (purchase.currency === "usdt") trackedVolumeUsdt += purchase.pricePoints / 1000 * 0.08;
    if (purchase.currency === "celo") trackedVolumeCelo += purchase.pricePoints / 1000;
    if (purchase.currency === "gdollar") trackedVolumeGdollar += purchase.pricePoints * 0.08;
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
    if (match.lastActivity >= weeklyCutoff) {
      addAddress(weeklyPlayers, match.host.address);
      addAddress(weeklyPlayers, match.joiner.address);
    }
    if (match.lastActivity >= monthlyCutoff) {
      addAddress(monthlyPlayers, match.host.address);
      addAddress(monthlyPlayers, match.joiner.address);
    }
    if (match.hostWagerTx) transactions.add(match.hostWagerTx.toLowerCase());
    if (match.joinerWagerTx) transactions.add(match.joinerWagerTx.toLowerCase());
    addTransaction(match.hostWagerTx, match.lastActivity);
    addTransaction(match.joinerWagerTx, match.lastActivity);
    addTrackedVolume(match.hostWagerCurrency, match.hostWagerAmount);
    addTrackedVolume(match.joinerWagerCurrency, match.joinerWagerAmount);
  }

  return {
    totalPlayers: totalPlayers.size,
    dailyPlayers: dailyPlayers.size,
    weeklyPlayers: weeklyPlayers.size,
    monthlyPlayers: monthlyPlayers.size,
    transactions: transactions.size,
    transactions24h: transactions24h.size,
    transactions7d: transactions7d.size,
    transactions30d: transactions30d.size,
    trackedVolumeUsdt,
    trackedVolumeCelo,
    trackedVolumeGdollar,
  };
}

async function getRetentionMetrics(): Promise<RetentionMetrics> {
  const now = Date.now();
  const historyKeys = await scanKeys("history:0x*");
  const histories = await Promise.all(historyKeys.map((key) => redis.get<ServerMatchRecord[]>(key)));

  let d1Eligible = 0;
  let d1Returned = 0;
  let d7Eligible = 0;
  let d7Returned = 0;
  let d30Eligible = 0;
  let d30Returned = 0;

  for (const records of histories) {
    if (!records?.length) continue;
    const timestamps = records
      .map((record) => Date.parse(record.date))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (!timestamps.length) continue;
    const firstSeen = timestamps[0];

    if (now - firstSeen >= DAY_MS) {
      d1Eligible += 1;
      if (timestamps.some((ts) => ts >= firstSeen + DAY_MS)) d1Returned += 1;
    }

    if (now - firstSeen >= 7 * DAY_MS) {
      d7Eligible += 1;
      if (timestamps.some((ts) => ts >= firstSeen + 7 * DAY_MS)) d7Returned += 1;
    }

    if (now - firstSeen >= 30 * DAY_MS) {
      d30Eligible += 1;
      if (timestamps.some((ts) => ts >= firstSeen + 30 * DAY_MS)) d30Returned += 1;
    }
  }

  return {
    d1Rate: d1Eligible > 0 ? d1Returned / d1Eligible : 0,
    d7Rate: d7Eligible > 0 ? d7Returned / d7Eligible : 0,
    d30Rate: d30Eligible > 0 ? d30Returned / d30Eligible : 0,
    d1Eligible,
    d7Eligible,
    d30Eligible,
  };
}

async function getTransactionHealthMetrics(): Promise<TransactionHealthMetrics> {
  const cached = await redis.get<TransactionHealthMetrics>(TX_HEALTH_CACHE_KEY).catch(() => null);
  if (cached) return cached;

  const [purchases, matchKeys, seasonPassKeys] = await Promise.all([
    getBlackMarketPurchaseActivity(),
    scanKeys("match:*"),
    scanKeys("season-pass:0x*"),
  ]);

  const matchRecords = await Promise.all(matchKeys.map((key) => redis.get<ServerMatch>(key)));
  const seasonPassRecords = await Promise.all(
    seasonPassKeys.map((key) => redis.get<{ txHash?: string }>(key))
  );

  const txByHash = new Map<string, number>();
  const addSample = (txHash: string | null | undefined, timestamp: number) => {
    const normalized = txHash?.trim().toLowerCase();
    if (!normalized) return;
    const existing = txByHash.get(normalized) ?? 0;
    txByHash.set(normalized, Math.max(existing, timestamp));
  };

  for (const purchase of purchases) addSample(purchase.txHash, purchase.purchasedAt);
  for (const match of matchRecords) {
    if (!match) continue;
    addSample(match.hostWagerTx, match.lastActivity);
    addSample(match.joinerWagerTx, match.lastActivity);
  }
  for (const record of seasonPassRecords) {
    if (record?.txHash) addSample(record.txHash, 0);
  }

  const sampleTxs = [...txByHash.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([txHash]) => txHash as `0x${string}`);

  if (sampleTxs.length === 0) {
    return {
      sampledTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      pendingTransactions: 0,
      failedRate: 0,
    };
  }

  const celoClient = createPublicClient({ chain: celo, transport: http() });
  let successfulTransactions = 0;
  let failedTransactions = 0;
  let pendingTransactions = 0;

  const timeout = new Promise<null[]>((resolve) =>
    setTimeout(() => resolve(sampleTxs.map(() => null)), TX_HEALTH_TIMEOUT_MS)
  );

  const receipts = await Promise.race([
    Promise.all(
      sampleTxs.map((txHash) =>
        celoClient.getTransactionReceipt({ hash: txHash }).then(
          (receipt) => receipt.status,
          () => null
        )
      )
    ),
    timeout,
  ]);

  for (const status of receipts) {
    if (status === "success") successfulTransactions += 1;
    else if (status === "reverted") failedTransactions += 1;
    else pendingTransactions += 1;
  }

  const resolvedTransactions = successfulTransactions + failedTransactions;
  const metrics = {
    sampledTransactions: sampleTxs.length,
    successfulTransactions,
    failedTransactions,
    pendingTransactions,
    failedRate: resolvedTransactions > 0 ? failedTransactions / resolvedTransactions : 0,
  };

  await redis.set(TX_HEALTH_CACHE_KEY, metrics, { ex: TX_HEALTH_CACHE_SECONDS }).catch(() => {});
  return metrics;
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * The ops/stats headline numbers, sourced entirely from Celo.
 *
 * Counters (passes sold) are read live — they are single eth_calls with no range
 * limits. Wallet identities come from event logs via onChainWallets.ts, because
 * the contracts expose no enumerable address list.
 *
 * Agent/automation wallets are excluded throughout: scripts/signup-env-wallets.ts
 * registered 112 of them on KnockOrderSignups in one burst, so an unfiltered
 * totalSignups reads ~6x its true value and is not a user metric.
 */
async function getOnChainStats() {
  const celoClient = createPublicClient({ chain: celo, transport: http() });
  const CELO_PASS_ACTIVE = SEASON_PASS_CONTRACT !== ZERO_ADDRESS;
  const GDOLLAR_PASS_ACTIVE = GDOLLAR_SEASON_PASS_CONTRACT !== ZERO_ADDRESS;

  const SIGNUPS_ACTIVE = SIGNUPS_CONTRACT !== ZERO_ADDRESS;

  const [passesSoldCelo, passesSoldGdollar, totalSignups, walletsResult] = await Promise.all([
    CELO_PASS_ACTIVE
      ? celoClient.readContract({ address: SEASON_PASS_CONTRACT, abi: SEASON_PASS_ABI, functionName: "totalPassesSold" }).catch(() => 0n)
      : Promise.resolve(0n),
    GDOLLAR_PASS_ACTIVE
      ? celoClient.readContract({ address: GDOLLAR_SEASON_PASS_CONTRACT, abi: GDOLLAR_SEASON_PASS_ABI, functionName: "totalPassesSold" }).catch(() => 0n)
      : Promise.resolve(0n),
    SIGNUPS_ACTIVE
      ? celoClient.readContract({ address: SIGNUPS_CONTRACT, abi: SIGNUPS_ABI, functionName: "totalSignups" }).catch(() => 0n)
      : Promise.resolve(0n),
    getOnChainWallets().catch((err) => {
      console.error("[ops] on-chain wallet read failed:", err);
      return null;
    }),
  ]);

  // A real wallet is any non-agent address that signed up or bought a pass.
  // Pass buyers matter on their own: signUp() only fires inside the verify+claim
  // flow, so a buyer who skipped that flow never reaches the signups contract.
  const realWallets = walletsResult
    ? Array.from(new Set([...walletsResult.signers, ...walletsResult.buyers])).filter((w) => !isBotWallet(w))
    : [];

  const verifiedResults = realWallets.length
    ? await celoClient
        .multicall({
          contracts: realWallets.map((wallet) => ({
            address: IDENTITY_CONTRACT,
            abi: IDENTITY_ABI,
            functionName: "isWhitelisted" as const,
            args: [wallet as `0x${string}`],
          })),
          allowFailure: true,
        })
        .catch(() => [])
    : [];

  const verifiedGoodDollar = verifiedResults.filter((r) => r.status === "success" && r.result === true).length;

  return {
    distinctRealWallets: realWallets.length,
    verifiedGoodDollar,
    unverified: realWallets.length - verifiedGoodDollar,
    passesSoldGdollar: Number(passesSoldGdollar),
    passesSoldCelo: Number(passesSoldCelo),
    totalPassesSold: Number(passesSoldCelo) + Number(passesSoldGdollar),
    // signUp() is once-per-address, so the SignedUp events we read back must
    // equal the contract's own counter exactly. Any shortfall means the log read
    // was truncated and the wallet counts are understated — surfaced so the UI
    // never presents a number that failed its own reconciliation.
    walletsComplete: (walletsResult?.signers.length ?? -1) === Number(totalSignups),
  };
}

function withFallback<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  return promise.catch((err) => {
    console.error(`[ops] ${label} failed:`, err);
    return fallback;
  });
}

export async function getBalanceDashboard() {
  const emptyRetention: RetentionMetrics = { d1Rate: 0, d7Rate: 0, d30Rate: 0, d1Eligible: 0, d7Eligible: 0, d30Eligible: 0 };
  const emptyTxHealth: TransactionHealthMetrics = { sampledTransactions: 0, successfulTransactions: 0, failedTransactions: 0, pendingTransactions: 0, failedRate: 0 };

  const [snapshot, activity, audience, onChain, retention, transactionHealth] = await Promise.all([
    withFallback(getRankedDashboardSnapshot(), { aggregate: { updatedAt: 0, totalMatches: 0, totalRounds: 0, totalMatchDurationMs: 0, totalRoundDurationMs: 0, cards: {}, characters: {}, skillBuckets: {}, matchups: {} }, totalCardPicks: 0, averageMatchMinutes: 0, averageRoundSeconds: 0, mirrorMatchRate: 0, topCards: [], characterRows: [], skillRows: [] }, "ranked snapshot"),
    withFallback(getOpsActivitySnapshot(), { house: { totalMatches: 0, winRate: 0, wageredMatches: 0, averagePointsEarned: 0, recentMatches: [], winnerRewardsIssued: 0, winnerRewardUsdTotal: 0, recentWinnerRewards: [] }, blackMarket: { totalPurchases: 0, uniqueBuyers: 0, gdollarPurchases: 0, usdtPurchases: 0, celoPurchases: 0, revenuePoints: 0, recentPurchases: [] } }, "ops activity"),
    withFallback(getAudienceMetrics(), { totalPlayers: 0, dailyPlayers: 0, weeklyPlayers: 0, monthlyPlayers: 0, transactions: 0, transactions24h: 0, transactions7d: 0, transactions30d: 0, trackedVolumeUsdt: 0, trackedVolumeCelo: 0, trackedVolumeGdollar: 0 }, "audience metrics"),
    withFallback(getOnChainStats(), { distinctRealWallets: 0, verifiedGoodDollar: 0, unverified: 0, passesSoldGdollar: 0, passesSoldCelo: 0, totalPassesSold: 0, walletsComplete: false }, "on-chain stats"),
    withFallback(getRetentionMetrics(), emptyRetention, "retention"),
    withFallback(getTransactionHealthMetrics(), emptyTxHealth, "tx health"),
  ]);
  return {
    snapshot,
    policy: BALANCE_POLICY,
    watchlist: buildBalanceWatchlist(snapshot),
    activity,
    audience,
    onChain,
    retention,
    transactionHealth,
  };
}

import { getRankedDashboardSnapshot, RankedDashboardSnapshot } from "./rankedTelemetry";

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
  const snapshot = await getRankedDashboardSnapshot();
  return {
    snapshot,
    policy: BALANCE_POLICY,
    watchlist: buildBalanceWatchlist(snapshot),
  };
}

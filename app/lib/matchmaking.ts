export type MultiplayerMode = "wager" | "ranked" | "tournament";

export type LeaderboardTab = "casual" | "ranked";

export function isPaidMultiplayerMode(mode: MultiplayerMode): boolean {
  return mode === "wager";
}

export function isRankedMultiplayerMode(mode: MultiplayerMode): boolean {
  return mode === "ranked";
}

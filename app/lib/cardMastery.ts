import type { CardPerformanceStats } from "./cardProgress";

const TIER_THRESHOLDS = [100, 260, 520, 900, 1400] as const;

export type CardMasteryTier = 0 | 1 | 2 | 3 | 4 | 5;

export type CardMasterySnapshot = {
  xp: number;
  tier: CardMasteryTier;
  nextTier: CardMasteryTier | null;
  nextTierXp: number | null;
  previousTierXp: number;
  progressToNext: number;
};

export type CardForgeProgress = {
  ready: boolean;
  requirements: Array<{
    label: string;
    current: number;
    target: number;
    complete: boolean;
  }>;
};

function clampTier(value: number): CardMasteryTier {
  return Math.max(0, Math.min(5, value)) as CardMasteryTier;
}

export function getCardMasteryXp(stats: CardPerformanceStats | null | undefined): number {
  if (!stats) return 0;
  return Math.max(
    0,
    stats.timesPlayed * 4 +
      stats.clashWins * 10 +
      stats.totalKnock * 2 +
      stats.matchWins * 18 +
      stats.bestKnock * 3
  );
}

export function getCardMasterySnapshot(stats: CardPerformanceStats | null | undefined): CardMasterySnapshot {
  const xp = getCardMasteryXp(stats);
  const thresholdIndex = TIER_THRESHOLDS.findIndex((threshold) => xp < threshold);
  const tier =
    thresholdIndex === -1 ? 5 : clampTier(thresholdIndex);
  const nextTier = tier >= 5 ? null : clampTier(tier + 1);
  const previousTierXp = tier === 0 ? 0 : TIER_THRESHOLDS[tier - 1];
  const nextTierXp = nextTier == null ? null : TIER_THRESHOLDS[nextTier - 1];
  const progressToNext =
    nextTierXp == null
      ? 1
      : Math.max(0, Math.min(1, (xp - previousTierXp) / Math.max(1, nextTierXp - previousTierXp)));

  return {
    xp,
    tier,
    nextTier,
    nextTierXp,
    previousTierXp,
    progressToNext,
  };
}

export function getCardMasteryPerkCopy(): string {
  return "First attuned reveal each match gains +1 Priority Surge.";
}

export function getNextUnlockCopy(nextTier: CardMasteryTier | null): string {
  if (nextTier == null) {
    return "Mythic prestige cap reached. Further growth is pure reputation.";
  }
  if (nextTier === 1) {
    return "Unlock your first mastery crest and tracked card prestige.";
  }
  if (nextTier === 2) {
    return "Earn a stronger mastery crest and deeper profile presence.";
  }
  if (nextTier === 3) {
    return "Unlock elite mastery standing for this card.";
  }
  if (nextTier === 4) {
    return "Push into veteran mastery prestige for this card.";
  }
  return "Reach mythic mastery status and max out this card's prestige.";
}

export function getMasteredCardCount(cardPerformance: Record<string, CardPerformanceStats>): number {
  return Object.values(cardPerformance).reduce((count, stats) => count + (getCardMasterySnapshot(stats).tier > 0 ? 1 : 0), 0);
}

export function getHighestMasteryTier(cardPerformance: Record<string, CardPerformanceStats>): CardMasteryTier {
  return Object.values(cardPerformance).reduce<CardMasteryTier>((highest, stats) => {
    const tier = getCardMasterySnapshot(stats).tier;
    return tier > highest ? tier : highest;
  }, 0);
}

export function getCardForgeProgress(stats: CardPerformanceStats | null | undefined): CardForgeProgress {
  const snapshot = getCardMasterySnapshot(stats);
  const source = stats ?? {
    timesPlayed: 0,
    clashWins: 0,
    totalKnock: 0,
    matchWins: 0,
    bestKnock: 0,
  };
  const requirements = [
    {
      label: "Tier",
      current: snapshot.tier,
      target: 5,
      complete: snapshot.tier >= 5,
    },
    {
      label: "Uses",
      current: source.timesPlayed,
      target: 25,
      complete: source.timesPlayed >= 25,
    },
    {
      label: "Clash Wins",
      current: source.clashWins,
      target: 12,
      complete: source.clashWins >= 12,
    },
    {
      label: "Knock",
      current: source.totalKnock,
      target: 100,
      complete: source.totalKnock >= 100,
    },
  ];

  return {
    ready: requirements.every((requirement) => requirement.complete),
    requirements,
  };
}

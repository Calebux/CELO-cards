import { CARDS, CHARACTERS } from "./gameData";
import { readLeaderboard } from "./leaderboard";
import { redis } from "./redis";

const AGGREGATE_KEY = "ranked-telemetry:aggregate";
const ROUND_DEDUPE_PREFIX = "ranked-telemetry:round:";
const MATCH_DEDUPE_PREFIX = "ranked-telemetry:match:";

export type RankedCardTelemetry = {
  picks: number;
  wins: number;
  losses: number;
  draws: number;
  lastSeen: number;
};

export type RankedCharacterTelemetry = {
  matches: number;
  wins: number;
  losses: number;
  lastSeen: number;
};

export type RankedSkillBucketTelemetry = {
  matches: number;
  wins: number;
  losses: number;
};

export type RankedMatchupTelemetry = {
  matches: number;
  hostWins: number;
  joinerWins: number;
  mirror: boolean;
};

export type RankedTelemetryAggregate = {
  updatedAt: number;
  totalMatches: number;
  totalRounds: number;
  totalMatchDurationMs: number;
  totalRoundDurationMs: number;
  cards: Record<string, RankedCardTelemetry>;
  characters: Record<string, RankedCharacterTelemetry>;
  skillBuckets: Record<string, RankedSkillBucketTelemetry>;
  matchups: Record<string, RankedMatchupTelemetry>;
};

export type RankedDashboardSnapshot = {
  aggregate: RankedTelemetryAggregate;
  totalCardPicks: number;
  averageMatchMinutes: number;
  averageRoundSeconds: number;
  mirrorMatchRate: number;
  topCards: Array<{
    id: string;
    name: string;
    picks: number;
    pickRate: number;
    winRate: number;
    sample: number;
  }>;
  characterRows: Array<{
    id: string;
    name: string;
    matches: number;
    winRate: number;
  }>;
  skillRows: Array<{
    bucket: string;
    matches: number;
    winRate: number;
  }>;
};

function createEmptyAggregate(): RankedTelemetryAggregate {
  return {
    updatedAt: 0,
    totalMatches: 0,
    totalRounds: 0,
    totalMatchDurationMs: 0,
    totalRoundDurationMs: 0,
    cards: {},
    characters: {},
    skillBuckets: {},
    matchups: {},
  };
}

function ensureCard(aggregate: RankedTelemetryAggregate, cardId: string): RankedCardTelemetry {
  aggregate.cards[cardId] ??= { picks: 0, wins: 0, losses: 0, draws: 0, lastSeen: 0 };
  return aggregate.cards[cardId];
}

function ensureCharacter(aggregate: RankedTelemetryAggregate, charId: string): RankedCharacterTelemetry {
  aggregate.characters[charId] ??= { matches: 0, wins: 0, losses: 0, lastSeen: 0 };
  return aggregate.characters[charId];
}

function ensureSkillBucket(aggregate: RankedTelemetryAggregate, bucket: string): RankedSkillBucketTelemetry {
  aggregate.skillBuckets[bucket] ??= { matches: 0, wins: 0, losses: 0 };
  return aggregate.skillBuckets[bucket];
}

function getSkillBucket(points: number): string {
  if (points >= 5000) return "Legend";
  if (points >= 2000) return "Master";
  if (points >= 1000) return "Veteran";
  if (points >= 400) return "Fighter";
  if (points >= 100) return "Rookie";
  return "Unranked";
}

export async function readRankedTelemetry(): Promise<RankedTelemetryAggregate> {
  return (await redis.get<RankedTelemetryAggregate>(AGGREGATE_KEY)) ?? createEmptyAggregate();
}

export async function recordRankedRoundTelemetry(params: {
  matchId: string;
  round: number;
  hostCharId: string;
  joinerCharId: string;
  hostCardIds: string[];
  joinerCardIds: string[];
  hostWonRound: boolean | null;
  roundDurationMs: number;
}) {
  const dedupe = await redis.set(`${ROUND_DEDUPE_PREFIX}${params.matchId}:${params.round}`, "1", {
    nx: true,
    ex: 60 * 60 * 24 * 30,
  });
  if (!dedupe) return;

  const aggregate = await readRankedTelemetry();
  const now = Date.now();

  aggregate.totalRounds += 1;
  aggregate.totalRoundDurationMs += Math.max(0, params.roundDurationMs);
  aggregate.updatedAt = now;

  for (const cardId of params.hostCardIds) {
    const entry = ensureCard(aggregate, cardId);
    entry.picks += 1;
    entry.lastSeen = now;
    if (params.hostWonRound === true) entry.wins += 1;
    else if (params.hostWonRound === false) entry.losses += 1;
    else entry.draws += 1;
  }

  for (const cardId of params.joinerCardIds) {
    const entry = ensureCard(aggregate, cardId);
    entry.picks += 1;
    entry.lastSeen = now;
    if (params.hostWonRound === false) entry.wins += 1;
    else if (params.hostWonRound === true) entry.losses += 1;
    else entry.draws += 1;
  }

  await redis.set(AGGREGATE_KEY, aggregate);
}

export async function recordRankedMatchTelemetry(params: {
  matchId: string;
  hostAddress: string;
  joinerAddress: string;
  hostCharId: string;
  joinerCharId: string;
  hostWonMatch: boolean;
  createdAt: number;
  completedAt: number;
}) {
  const dedupe = await redis.set(`${MATCH_DEDUPE_PREFIX}${params.matchId}`, "1", {
    nx: true,
    ex: 60 * 60 * 24 * 30,
  });
  if (!dedupe) return;

  const aggregate = await readRankedTelemetry();
  const leaderboard = await readLeaderboard();
  const ranked = leaderboard.ranked;
  const now = Date.now();

  aggregate.totalMatches += 1;
  aggregate.totalMatchDurationMs += Math.max(0, params.completedAt - params.createdAt);
  aggregate.updatedAt = now;

  const hostChar = ensureCharacter(aggregate, params.hostCharId);
  hostChar.matches += 1;
  hostChar.wins += params.hostWonMatch ? 1 : 0;
  hostChar.losses += params.hostWonMatch ? 0 : 1;
  hostChar.lastSeen = now;

  const joinerChar = ensureCharacter(aggregate, params.joinerCharId);
  joinerChar.matches += 1;
  joinerChar.wins += params.hostWonMatch ? 0 : 1;
  joinerChar.losses += params.hostWonMatch ? 1 : 0;
  joinerChar.lastSeen = now;

  const hostPoints = ranked[params.hostAddress.toLowerCase()]?.points ?? 0;
  const joinerPoints = ranked[params.joinerAddress.toLowerCase()]?.points ?? 0;

  const hostBucket = ensureSkillBucket(aggregate, getSkillBucket(hostPoints));
  hostBucket.matches += 1;
  hostBucket.wins += params.hostWonMatch ? 1 : 0;
  hostBucket.losses += params.hostWonMatch ? 0 : 1;

  const joinerBucket = ensureSkillBucket(aggregate, getSkillBucket(joinerPoints));
  joinerBucket.matches += 1;
  joinerBucket.wins += params.hostWonMatch ? 0 : 1;
  joinerBucket.losses += params.hostWonMatch ? 1 : 0;

  const [left, right] = [params.hostCharId, params.joinerCharId].sort();
  const matchupKey = `${left}__${right}`;
  aggregate.matchups[matchupKey] ??= {
    matches: 0,
    hostWins: 0,
    joinerWins: 0,
    mirror: params.hostCharId === params.joinerCharId,
  };
  aggregate.matchups[matchupKey].matches += 1;
  aggregate.matchups[matchupKey].hostWins += params.hostWonMatch ? 1 : 0;
  aggregate.matchups[matchupKey].joinerWins += params.hostWonMatch ? 0 : 1;

  await redis.set(AGGREGATE_KEY, aggregate);
}

export async function getRankedDashboardSnapshot(): Promise<RankedDashboardSnapshot> {
  const aggregate = await readRankedTelemetry();
  const totalCardPicks = Object.values(aggregate.cards).reduce((sum, card) => sum + card.picks, 0);
  const mirrorMatches = Object.values(aggregate.matchups).reduce((sum, item) => sum + (item.mirror ? item.matches : 0), 0);

  const topCards = Object.entries(aggregate.cards)
    .map(([id, stats]) => {
      const sample = stats.wins + stats.losses;
      return {
        id,
        name: CARDS.find((card) => card.id === id)?.name ?? id,
        picks: stats.picks,
        pickRate: totalCardPicks > 0 ? stats.picks / totalCardPicks : 0,
        winRate: sample > 0 ? stats.wins / sample : 0,
        sample,
      };
    })
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 10);

  const characterRows = Object.entries(aggregate.characters)
    .map(([id, stats]) => ({
      id,
      name: CHARACTERS.find((char) => char.id === id)?.name ?? id,
      matches: stats.matches,
      winRate: stats.matches > 0 ? stats.wins / stats.matches : 0,
    }))
    .sort((a, b) => b.matches - a.matches);

  const skillRows = Object.entries(aggregate.skillBuckets)
    .map(([bucket, stats]) => ({
      bucket,
      matches: stats.matches,
      winRate: stats.matches > 0 ? stats.wins / stats.matches : 0,
    }))
    .sort((a, b) => b.matches - a.matches);

  return {
    aggregate,
    totalCardPicks,
    averageMatchMinutes: aggregate.totalMatches > 0 ? aggregate.totalMatchDurationMs / aggregate.totalMatches / 60_000 : 0,
    averageRoundSeconds: aggregate.totalRounds > 0 ? aggregate.totalRoundDurationMs / aggregate.totalRounds / 1000 : 0,
    mirrorMatchRate: aggregate.totalMatches > 0 ? mirrorMatches / aggregate.totalMatches : 0,
    topCards,
    characterRows,
    skillRows,
  };
}

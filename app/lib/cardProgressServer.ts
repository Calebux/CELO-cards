import { CARDS } from "./gameData";
import { redis } from "./redis";
import type { SlotResult } from "./combatEngine";
import { ATTUNEMENT_LIMIT, emptyCardPerformance, emptyCardProgress } from "./cardProgress";
import type { CardProgressPayload, CardPerformanceStats } from "./cardProgress";

const CARD_PROGRESS_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CARD_PROGRESS_AUTH_TTL_SECONDS = 10 * 60;
const VALID_CARD_IDS = new Set(CARDS.map((card) => card.id));

type Perspective = "player" | "opponent";

function legacyCardProgressKey(address: string): string {
  return `card-progress:${address.toLowerCase()}`;
}

export function cardProgressNonceKey(address: string): string {
  return `card-progress:nonce:${address.toLowerCase()}`;
}

function cardProgressAttunementKey(address: string): string {
  return `card-progress:attunement:${address.toLowerCase()}`;
}

function cardProgressPerformanceKey(address: string): string {
  return `card-progress:performance:${address.toLowerCase()}`;
}

export function cardProgressRoundKey(scope: string, round: number): string {
  return `card-progress:round:${scope}:${round}`;
}

function normalizeStatValue(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function sanitizeCardPerformance(input: unknown): Record<string, CardPerformanceStats> {
  if (!input || typeof input !== "object") return {};

  const next: Record<string, CardPerformanceStats> = {};
  for (const [cardId, rawStats] of Object.entries(input as Record<string, unknown>)) {
    if (!VALID_CARD_IDS.has(cardId) || !rawStats || typeof rawStats !== "object") continue;
    const stats = rawStats as Partial<CardPerformanceStats>;
    next[cardId] = {
      timesPlayed: normalizeStatValue(stats.timesPlayed),
      clashWins: normalizeStatValue(stats.clashWins),
      totalKnock: normalizeStatValue(stats.totalKnock),
      matchWins: normalizeStatValue(stats.matchWins),
      bestKnock: normalizeStatValue(stats.bestKnock),
    };
  }
  return next;
}

function sanitizeAttunedCardIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const cardId of input) {
    if (typeof cardId !== "string" || !VALID_CARD_IDS.has(cardId) || seen.has(cardId)) continue;
    seen.add(cardId);
    next.push(cardId);
    if (next.length >= ATTUNEMENT_LIMIT) break;
  }
  return next;
}

export function sanitizeCardProgressPayload(input: unknown): CardProgressPayload {
  const body = input && typeof input === "object" ? (input as Partial<CardProgressPayload>) : {};
  const legacySignatureCardId =
    "signatureCardId" in (body as Record<string, unknown>) &&
    typeof (body as Record<string, unknown>).signatureCardId === "string" &&
    VALID_CARD_IDS.has((body as Record<string, unknown>).signatureCardId as string)
      ? ((body as Record<string, unknown>).signatureCardId as string)
      : null;
  return {
    attunedCardIds:
      "attunedCardIds" in (body as Record<string, unknown>)
        ? sanitizeAttunedCardIds(body.attunedCardIds)
        : legacySignatureCardId
          ? [legacySignatureCardId]
          : [],
    cardPerformance: sanitizeCardPerformance(body.cardPerformance),
    updatedAt: normalizeStatValue(body.updatedAt),
  };
}

function sanitizeAttunementSnapshot(input: unknown): { attunedCardIds: string[]; updatedAt: number } {
  const body =
    input && typeof input === "object"
      ? (input as { attunedCardIds?: unknown; signatureCardId?: unknown; updatedAt?: unknown })
      : {};
  const legacySignatureCardId =
    typeof body.signatureCardId === "string" && VALID_CARD_IDS.has(body.signatureCardId) ? body.signatureCardId : null;
  return {
    attunedCardIds:
      "attunedCardIds" in body
        ? sanitizeAttunedCardIds(body.attunedCardIds)
        : legacySignatureCardId
          ? [legacySignatureCardId]
          : [],
    updatedAt: normalizeStatValue(body.updatedAt),
  };
}

function sanitizePerformanceSnapshot(input: unknown): { cardPerformance: Record<string, CardPerformanceStats>; updatedAt: number } {
  const body = input && typeof input === "object" ? (input as { cardPerformance?: unknown; updatedAt?: unknown }) : {};
  return {
    cardPerformance: sanitizeCardPerformance(body.cardPerformance),
    updatedAt: normalizeStatValue(body.updatedAt),
  };
}

export async function getCardProgress(address: string): Promise<CardProgressPayload> {
  const [legacyRaw, attunementRaw, performanceRaw] = await Promise.all([
    redis.get<CardProgressPayload>(legacyCardProgressKey(address)),
    redis.get(cardProgressAttunementKey(address)),
    redis.get(cardProgressPerformanceKey(address)),
  ]);

  const legacy = sanitizeCardProgressPayload(legacyRaw ?? emptyCardProgress());
  const attunement = sanitizeAttunementSnapshot(
    attunementRaw ?? { attunedCardIds: legacy.attunedCardIds, updatedAt: legacy.updatedAt }
  );
  const performance = sanitizePerformanceSnapshot(
    performanceRaw ?? { cardPerformance: legacy.cardPerformance, updatedAt: legacy.updatedAt }
  );

  return {
    attunedCardIds: attunement.attunedCardIds,
    cardPerformance: performance.cardPerformance,
    updatedAt: Math.max(legacy.updatedAt, attunement.updatedAt, performance.updatedAt),
  };
}

export async function saveCardProgress(address: string, payload: CardProgressPayload): Promise<CardProgressPayload> {
  const normalized = sanitizeCardProgressPayload(payload);
  await Promise.all([
    redis.set(
      cardProgressAttunementKey(address),
      {
        attunedCardIds: normalized.attunedCardIds,
        updatedAt: normalized.updatedAt,
      },
      { ex: CARD_PROGRESS_TTL_SECONDS }
    ),
    redis.set(
      cardProgressPerformanceKey(address),
      {
        cardPerformance: normalized.cardPerformance,
        updatedAt: normalized.updatedAt,
      },
      { ex: CARD_PROGRESS_TTL_SECONDS }
    ),
  ]);
  return normalized;
}

export async function updateAttunedCardProgress(address: string, attunedCardIds: string[]): Promise<CardProgressPayload> {
  const existing = await getCardProgress(address);
  const updatedAt = Date.now();
  await redis.set(
    cardProgressAttunementKey(address),
    {
      attunedCardIds: sanitizeAttunedCardIds(attunedCardIds),
      updatedAt,
    },
    { ex: CARD_PROGRESS_TTL_SECONDS }
  );
  return {
    ...existing,
    attunedCardIds: sanitizeAttunedCardIds(attunedCardIds),
    updatedAt: Math.max(existing.updatedAt, updatedAt),
  };
}

export async function claimCardProgressRound(scope: string, round: number): Promise<boolean> {
  const result = await redis.set(cardProgressRoundKey(scope, round), "1", {
    nx: true,
    ex: CARD_PROGRESS_TTL_SECONDS,
  });
  return !!result;
}

export async function recordResolvedCardPerformance(params: {
  address: string;
  perspective: Perspective;
  slots: SlotResult[];
  matchWon?: boolean;
  usedCardIdsForMatchWin?: string[];
}): Promise<CardProgressPayload> {
  const { address, perspective, slots, matchWon = false, usedCardIdsForMatchWin = [] } = params;
  const progress = await getCardProgress(address);
  const nextCardPerformance: Record<string, CardPerformanceStats> = { ...progress.cardPerformance };

  for (const slot of slots) {
    const card = perspective === "player" ? slot.playerCard : slot.opponentCard;
    if (!VALID_CARD_IDS.has(card.id)) continue;

    const knock = perspective === "player" ? slot.playerKnock : slot.opponentKnock;
    const wonClash = perspective === "player" ? slot.winner === "player" : slot.winner === "opponent";
    const current = nextCardPerformance[card.id] ?? emptyCardPerformance();

    nextCardPerformance[card.id] = {
      timesPlayed: current.timesPlayed + 1,
      clashWins: current.clashWins + (wonClash ? 1 : 0),
      totalKnock: current.totalKnock + Math.max(0, knock),
      matchWins: current.matchWins,
      bestKnock: Math.max(current.bestKnock, Math.max(0, knock)),
    };
  }

  if (matchWon) {
    const uniqueIds = new Set(
      usedCardIdsForMatchWin.filter((cardId): cardId is string => VALID_CARD_IDS.has(cardId))
    );
    uniqueIds.forEach((cardId) => {
      const current = nextCardPerformance[cardId] ?? emptyCardPerformance();
      nextCardPerformance[cardId] = {
        ...current,
        matchWins: current.matchWins + 1,
      };
    });
  }

  const updatedAt = Date.now();
  await redis.set(
    cardProgressPerformanceKey(address),
    {
      cardPerformance: nextCardPerformance,
      updatedAt,
    },
    { ex: CARD_PROGRESS_TTL_SECONDS }
  );

  return {
    attunedCardIds: progress.attunedCardIds,
    cardPerformance: nextCardPerformance,
    updatedAt: Math.max(progress.updatedAt, updatedAt),
  };
}

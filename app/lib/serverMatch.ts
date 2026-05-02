import { MultiplayerMode, isPaidMultiplayerMode } from "./matchmaking";
import { SlotResult } from "./combatEngine";

const FREE_MATCH_STALE_MS = 10 * 60 * 1000;
const PAID_MATCH_STALE_MS = 60 * 60 * 1000;

export interface PlayerSlot {
  charId: string | null;
  playerName: string | null;
  address: string | null;
  cardIds: string[] | null;
  orderRound: number;
}

export interface ServerMatch {
  id: string;
  createdAt: number;
  lastActivity: number;
  joinWindowExpiresAt: number | null;
  mode: MultiplayerMode;
  host: PlayerSlot;
  joiner: PlayerSlot;
  round: number;
  hostWins: number;
  joinerWins: number;
  resolvedSlots: SlotResult[] | null;
  roundSubmitStartedAt: number | null; // timestamp when first player submitted for current round
  hostWagerTx: string | null;
  joinerWagerTx: string | null;
  hostWagerAmount: string | null;
  joinerWagerAmount: string | null;
  winnerAddress: string | null;
  completedAt: number | null;
  abortedBy: "host" | "joiner" | null;
}

export function emptyPlayerSlot(): PlayerSlot {
  return { charId: null, playerName: null, address: null, cardIds: null, orderRound: 0 };
}

export function newServerMatch(matchId: string, mode: MultiplayerMode = "wager"): ServerMatch {
  const now = Date.now();
  return {
    id: matchId,
    createdAt: now,
    lastActivity: now,
    joinWindowExpiresAt: now + getOpenMatchStaleLimitMs({ mode }),
    mode,
    host: emptyPlayerSlot(),
    joiner: emptyPlayerSlot(),
    round: 1,
    hostWins: 0,
    joinerWins: 0,
    resolvedSlots: null,
    roundSubmitStartedAt: null,
    hostWagerTx: null,
    joinerWagerTx: null,
    hostWagerAmount: null,
    joinerWagerAmount: null,
    winnerAddress: null,
    completedAt: null,
    abortedBy: null,
  };
}

export function matchNeedsPayment(match: ServerMatch): boolean {
  return isPaidMultiplayerMode(match.mode);
}

export function getOpenMatchStaleLimitMs(match: Pick<ServerMatch, "mode">): number {
  return isPaidMultiplayerMode(match.mode) ? PAID_MATCH_STALE_MS : FREE_MATCH_STALE_MS;
}

export function reopenJoinWindow(match: ServerMatch, now = Date.now()): void {
  match.joinWindowExpiresAt = now + getOpenMatchStaleLimitMs(match);
}

export function closeJoinWindow(match: ServerMatch, now = Date.now()): void {
  match.joinWindowExpiresAt = now;
}

export function isJoinWindowOpen(match: Pick<ServerMatch, "joinWindowExpiresAt">, now = Date.now()): boolean {
  return (match.joinWindowExpiresAt ?? 0) > now;
}

import { MultiplayerMode, isPaidMultiplayerMode } from "./matchmaking";
import { SlotResult } from "./combatEngine";

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
  mode: MultiplayerMode;
  host: PlayerSlot;
  joiner: PlayerSlot;
  round: number;
  hostWins: number;
  joinerWins: number;
  resolvedSlots: SlotResult[] | null;
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
    mode,
    host: emptyPlayerSlot(),
    joiner: emptyPlayerSlot(),
    round: 1,
    hostWins: 0,
    joinerWins: 0,
    resolvedSlots: null,
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

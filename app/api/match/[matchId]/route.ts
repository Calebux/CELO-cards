export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveRound, SlotResult } from "../../../lib/combatEngine";
import { CARDS, CHARACTERS } from "../../../lib/gameData";

// ── Types ──────────────────────────────────────────────────────────────────

interface PlayerSlot {
  charId: string | null;
  cardIds: string[] | null; // current round order
  orderRound: number;       // which round these cards are for
}

interface ServerMatch {
  id: string;
  createdAt: number;
  lastActivity: number;     // updated on every POST/PATCH
  host: PlayerSlot;
  joiner: PlayerSlot;
  round: number;            // server's current round (starts at 1)
  hostWins: number;
  joinerWins: number;
  resolvedSlots: SlotResult[] | null; // host perspective
}

// ── In-memory store ────────────────────────────────────────────────────────

const matches = new Map<string, ServerMatch>();

const TWO_HOURS = 2 * 60 * 60 * 1000;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function pruneOldMatches() {
  const now = Date.now();
  for (const [id, m] of matches) {
    if (now - m.createdAt > TWO_HOURS) matches.delete(id);
  }
}

function isTimedOut(match: ServerMatch): boolean {
  // Only time out if neither player has registered a character yet
  // (i.e. opponent never showed up). Active matches are not timed out.
  const bothJoined = match.host.charId && match.joiner.charId;
  if (bothJoined) return false;
  return Date.now() - match.lastActivity > INACTIVITY_TIMEOUT;
}

function emptySlot(): PlayerSlot {
  return { charId: null, cardIds: null, orderRound: 0 };
}

function validRole(role: unknown): role is "host" | "joiner" {
  return role === "host" || role === "joiner";
}

// ── Perspective flip for joiner ─────────────────────────────────────────────

function flipPerspective(slots: SlotResult[]): SlotResult[] {
  return slots.map((s) => ({
    ...s,
    playerCard: s.opponentCard,
    opponentCard: s.playerCard,
    playerKnock: s.opponentKnock,
    opponentKnock: s.playerKnock,
    winner:
      s.winner === "player" ? "opponent" :
      s.winner === "opponent" ? "player" : "draw",
    typeAdvantage:
      s.typeAdvantage === "win" ? "lose" :
      s.typeAdvantage === "lose" ? "win" : "draw",
    priorityWinner:
      s.priorityWinner === "player" ? "opponent" :
      s.priorityWinner === "opponent" ? "player" : "tie",
  }));
}

// ── Route helpers ──────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ matchId: string }> };

// GET — poll match state
export async function GET(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  const role = req.nextUrl.searchParams.get("role") as "host" | "joiner" | null;

  let match = matches.get(matchId);

  // Auto-create if host polls and match doesn't exist yet
  if (!match) {
    const now = Date.now();
    match = {
      id: matchId,
      createdAt: now,
      lastActivity: now,
      host: emptySlot(),
      joiner: emptySlot(),
      round: 1,
      hostWins: 0,
      joinerWins: 0,
      resolvedSlots: null,
    };
    matches.set(matchId, match);
  }

  // Check inactivity timeout
  if (isTimedOut(match)) {
    return NextResponse.json({ phase: "timed-out" });
  }

  const self = role === "host" ? match.host : match.joiner;
  const other = role === "host" ? match.joiner : match.host;

  const opponentCharId = other.charId;

  // Determine phase from this player's perspective
  let phase: "waiting-for-opponent" | "resolved" | "lobby" | "timed-out";
  if (match.resolvedSlots !== null) {
    phase = "resolved";
  } else if (!opponentCharId) {
    phase = "lobby";
  } else {
    phase = "waiting-for-opponent";
  }

  const rawSlots = match.resolvedSlots;
  const slots = rawSlots
    ? role === "joiner" ? flipPerspective(rawSlots) : rawSlots
    : null;

  return NextResponse.json({
    round: match.round,
    opponentCharId,
    selfCharId: self.charId,
    phase,
    slots,
    hostWins: role === "host" ? match.hostWins : match.joinerWins,
    opponentWins: role === "host" ? match.joinerWins : match.hostWins,
  });
}

// POST — register character
export async function POST(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  pruneOldMatches();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { role, characterId } = body as { role: unknown; characterId: unknown };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }
  if (typeof characterId !== "string" || !CHARACTERS.find((c) => c.id === characterId)) {
    return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
  }

  const now = Date.now();
  let match = matches.get(matchId);
  if (!match) {
    match = {
      id: matchId,
      createdAt: now,
      lastActivity: now,
      host: emptySlot(),
      joiner: emptySlot(),
      round: 1,
      hostWins: 0,
      joinerWins: 0,
      resolvedSlots: null,
    };
    matches.set(matchId, match);
  }

  match.lastActivity = now;
  if (role === "host") match.host.charId = characterId;
  else match.joiner.charId = characterId;

  return NextResponse.json({ ok: true });
}

// PATCH — submit card order; resolve when both submitted
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { role, cardIds, round } = body as {
    role: unknown;
    cardIds: unknown;
    round: unknown;
  };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }
  if (!Array.isArray(cardIds) || cardIds.length !== 5 || cardIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "cardIds must be an array of 5 card ID strings" }, { status: 400 });
  }
  if (typeof round !== "number" || round < 1) {
    return NextResponse.json({ error: "round must be a positive integer" }, { status: 400 });
  }

  // Validate each card ID exists in the game data
  const invalidCard = cardIds.find((id) => !CARDS.find((c) => c.id === id));
  if (invalidCard) {
    return NextResponse.json({ error: `Unknown card: ${invalidCard}` }, { status: 400 });
  }

  const match = matches.get(matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  match.lastActivity = Date.now();

  // Advance server round if client is submitting for a newer round
  if (round > match.round) {
    match.round = round;
    match.host.cardIds = null;
    match.host.orderRound = 0;
    match.joiner.cardIds = null;
    match.joiner.orderRound = 0;
    match.resolvedSlots = null;
  }

  // Store this player's order
  const slot = role === "host" ? match.host : match.joiner;
  slot.cardIds = cardIds;
  slot.orderRound = round;

  // Resolve if both orders are in for the current round
  if (
    match.host.cardIds &&
    match.joiner.cardIds &&
    match.host.orderRound === match.round &&
    match.joiner.orderRound === match.round
  ) {
    const hostChar = CHARACTERS.find((c) => c.id === match!.host.charId);
    const joinerChar = CHARACTERS.find((c) => c.id === match!.joiner.charId);

    if (!hostChar || !joinerChar) {
      return NextResponse.json({ error: "Character data missing — re-select characters" }, { status: 422 });
    }

    const hostCards = match.host.cardIds
      .map((id) => CARDS.find((c) => c.id === id))
      .filter(Boolean) as typeof CARDS;
    const joinerCards = match.joiner.cardIds
      .map((id) => CARDS.find((c) => c.id === id))
      .filter(Boolean) as typeof CARDS;

    const result = resolveRound(hostCards, joinerCards, hostChar, joinerChar);
    match.resolvedSlots = result.slots;

    // Update win counters
    if (result.roundWinner === "player") match.hostWins++;
    else if (result.roundWinner === "opponent") match.joinerWins++;
  }

  return NextResponse.json({ ok: true, round: match.round });
}

// DELETE — explicitly clean up a finished or abandoned match
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  const existed = matches.has(matchId);
  matches.delete(matchId);
  return NextResponse.json({ ok: true, deleted: existed });
}

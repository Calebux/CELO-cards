export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveRound, SlotResult } from "../../../lib/combatEngine";
import { CARDS, CHARACTERS } from "../../../lib/gameData";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

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
  hostWagerTx:     string | null;  // wager TX hash from host
  joinerWagerTx:   string | null;  // wager TX hash from joiner
  hostWagerAmount:   string | null;  // stake in wei (as decimal string)
  joinerWagerAmount: string | null;
}

// ── File-based store (persists across serverless instances) ────────────────

const DATA_DIR  = resolve(process.cwd(), "data");
const STORE_PATH = resolve(DATA_DIR, "matches.json");

function readStore(): Record<string, ServerMatch> {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(STORE_PATH)) return {};
    return JSON.parse(readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ServerMatch>) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(store));
  } catch { /* ignore write errors on read-only fs */ }
}

const TWO_HOURS = 2 * 60 * 60 * 1000;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function pruneOldMatches(store: Record<string, ServerMatch>) {
  const now = Date.now();
  for (const id of Object.keys(store)) {
    if (now - store[id].createdAt > TWO_HOURS) delete store[id];
  }
}

function isTimedOut(match: ServerMatch): boolean {
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

  const store = readStore();
  let match = store[matchId];

  // Auto-create if match doesn't exist yet
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
      hostWagerTx: null,
      joinerWagerTx: null,
      hostWagerAmount: null,
      joinerWagerAmount: null,
    };
    store[matchId] = match;
    writeStore(store);
  }

  if (isTimedOut(match)) {
    return NextResponse.json({ phase: "timed-out" });
  }

  const self = role === "host" ? match.host : match.joiner;
  const other = role === "host" ? match.joiner : match.host;
  const opponentCharId = other.charId;

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
    hostWins:      role === "host" ? match.hostWins   : match.joinerWins,
    opponentWins:  role === "host" ? match.joinerWins : match.hostWins,
    selfWagered:      role === "host" ? !!match.hostWagerTx     : !!match.joinerWagerTx,
    opponentWagered:  role === "host" ? !!match.joinerWagerTx   : !!match.hostWagerTx,
    hostWagerAmount:  match.hostWagerAmount,   // always expose so joiner knows what to match
  });
}

// POST — register character
export async function POST(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

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

  const store = readStore();
  pruneOldMatches(store);

  const now = Date.now();
  if (!store[matchId]) {
    store[matchId] = {
      id: matchId,
      createdAt: now,
      lastActivity: now,
      host: emptySlot(),
      joiner: emptySlot(),
      round: 1,
      hostWins: 0,
      joinerWins: 0,
      resolvedSlots: null,
      hostWagerTx: null,
      joinerWagerTx: null,
      hostWagerAmount: null,
      joinerWagerAmount: null,
    };
  }

  const match = store[matchId];
  match.lastActivity = now;
  if (role === "host") match.host.charId = characterId;
  else match.joiner.charId = characterId;

  writeStore(store);
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

  const { role, cardIds, round, action, wagerTx, wagerAmount } = body as {
    role: unknown;
    cardIds: unknown;
    round: unknown;
    action?: string;
    wagerTx?: string;
    wagerAmount?: string; // stake in wei as decimal string
  };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }

  // ── Register wager TX for this player ───────────────────────────────────
  if (action === "wager") {
    const store = readStore();
    const match = store[matchId];
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    if (role === "host") {
      match.hostWagerTx = wagerTx ?? null;
      match.hostWagerAmount = wagerAmount ?? null;
    } else {
      match.joinerWagerTx = wagerTx ?? null;
      match.joinerWagerAmount = wagerAmount ?? null;
    }
    match.lastActivity = Date.now();
    writeStore(store);
    return NextResponse.json({ ok: true });
  }
  if (!Array.isArray(cardIds) || cardIds.length !== 5 || cardIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "cardIds must be an array of 5 card ID strings" }, { status: 400 });
  }
  if (typeof round !== "number" || round < 1) {
    return NextResponse.json({ error: "round must be a positive integer" }, { status: 400 });
  }

  const invalidCard = cardIds.find((id) => !CARDS.find((c) => c.id === id));
  if (invalidCard) {
    return NextResponse.json({ error: `Unknown card: ${invalidCard}` }, { status: 400 });
  }

  const store = readStore();
  const match = store[matchId];
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  match.lastActivity = Date.now();

  if (round > match.round) {
    match.round = round;
    match.host.cardIds = null;
    match.host.orderRound = 0;
    match.joiner.cardIds = null;
    match.joiner.orderRound = 0;
    match.resolvedSlots = null;
  }

  const slot = role === "host" ? match.host : match.joiner;
  slot.cardIds = cardIds;
  slot.orderRound = round;

  if (
    match.host.cardIds &&
    match.joiner.cardIds &&
    match.host.orderRound === match.round &&
    match.joiner.orderRound === match.round
  ) {
    const hostChar = CHARACTERS.find((c) => c.id === match.host.charId);
    const joinerChar = CHARACTERS.find((c) => c.id === match.joiner.charId);

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

    if (result.roundWinner === "player") match.hostWins++;
    else if (result.roundWinner === "opponent") match.joinerWins++;
  }

  writeStore(store);
  return NextResponse.json({ ok: true, round: match.round });
}

// DELETE — explicitly clean up a finished or abandoned match
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  const store = readStore();
  const existed = !!store[matchId];
  delete store[matchId];
  writeStore(store);
  return NextResponse.json({ ok: true, deleted: existed });
}

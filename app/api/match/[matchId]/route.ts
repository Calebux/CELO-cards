export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveRound, SlotResult } from "../../../lib/combatEngine";
import { CARDS, CHARACTERS } from "../../../lib/gameData";
import { getMatch, setMatch, deleteMatch, addToOpenMatches, removeFromOpenMatches } from "../../../lib/redis";
import { recordMatchResult } from "../../../lib/leaderboard";

// ── Types ──────────────────────────────────────────────────────────────────

interface PlayerSlot {
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
  host: PlayerSlot;
  joiner: PlayerSlot;
  round: number;
  hostWins: number;
  joinerWins: number;
  resolvedSlots: SlotResult[] | null;
  hostWagerTx:      string | null;
  joinerWagerTx:    string | null;
  hostWagerAmount:  string | null;
  joinerWagerAmount: string | null;
  abortedBy:       "host" | "joiner" | null;
}

const INACTIVITY_TIMEOUT      = 5  * 60 * 1000; // 5 minutes (free matches)
const WAGER_INACTIVITY_TIMEOUT = 45 * 60 * 1000; // 45 minutes (paid matches)

function isTimedOut(match: ServerMatch): boolean {
  const bothJoined = match.host.charId && match.joiner.charId;
  if (bothJoined) return false;
  const timeout = match.hostWagerTx ? WAGER_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT;
  return Date.now() - match.lastActivity > timeout;
}

function emptySlot(): PlayerSlot {
  return { charId: null, playerName: null, address: null, cardIds: null, orderRound: 0 };
}

function validRole(role: unknown): role is "host" | "joiner" {
  return role === "host" || role === "joiner";
}

function newMatch(matchId: string): ServerMatch {
  const now = Date.now();
  return {
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
    abortedBy: null,
  };
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

  let match = await getMatch<ServerMatch>(matchId);

  if (!match) {
    match = newMatch(matchId);
    await setMatch(matchId, match);
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
    opponentName: other.playerName,
    selfCharId: self.charId,
    phase,
    slots,
    hostWins:        role === "host" ? match.hostWins   : match.joinerWins,
    opponentWins:    role === "host" ? match.joinerWins : match.hostWins,
    selfWagered:     role === "host" ? !!match.hostWagerTx   : !!match.joinerWagerTx,
    opponentWagered: role === "host" ? !!match.joinerWagerTx : !!match.hostWagerTx,
    hostWagerAmount: match.hostWagerAmount,
    abortedBy:       match.abortedBy ?? null,
  });
}

// POST — register character
export async function POST(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, characterId, playerName, address, wagerTx, wagerAmount } = body as { role: unknown; characterId: unknown; playerName?: string; address?: string; wagerTx?: string; wagerAmount?: string };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }
  if (typeof characterId !== "string" || !CHARACTERS.find((c) => c.id === characterId)) {
    return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
  }

  let match: ServerMatch | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    match = await getMatch<ServerMatch>(matchId) ?? newMatch(matchId);
    match.lastActivity = Date.now();
    if (role === "host") {
      match.host.charId = characterId;
      if (typeof playerName === "string") match.host.playerName = playerName;
      if (address) match.host.address = address;
      // Save wager info if provided (host paid before character select)
      if (typeof wagerTx === "string" && !match.hostWagerTx) match.hostWagerTx = wagerTx;
      if (typeof wagerAmount === "string" && !match.hostWagerAmount) match.hostWagerAmount = wagerAmount;
    } else {
      match.joiner.charId = characterId;
      if (typeof playerName === "string") match.joiner.playerName = playerName;
      if (address) match.joiner.address = address;
    }

    try {
      await setMatch(matchId, match);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }

  // Track open/closed state in the lobby list
  if (role === "host") {
    await addToOpenMatches(matchId).catch(() => {});
  } else if (role === "joiner") {
    await removeFromOpenMatches(matchId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// PATCH — wager registration OR card order submission
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, cardIds, round, action, wagerTx, wagerAmount, playerName: patchPlayerName } = body as {
    role: unknown;
    cardIds: unknown;
    round: unknown;
    action?: string;
    wagerTx?: string;
    wagerAmount?: string;
    playerName?: string;
  };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }

  // ── Keepalive (host waiting on ready page) ──────────────────────────────
  if (action === "keepalive") {
    let match = await getMatch<ServerMatch>(matchId);
    if (!match) {
      // Match doesn't exist yet — create it now so it appears in open matches
      match = newMatch(matchId);
    }
    match.lastActivity = Date.now();
    // Store player name if host provides it before character selection
    if (validRole(role) && role === "host" && typeof patchPlayerName === "string" && patchPlayerName && !match.host.playerName) {
      match.host.playerName = patchPlayerName;
    }
    await setMatch(matchId, match).catch(() => {});
    // Keep the match visible in open matches while waiting for a joiner
    if (validRole(role) && role === "host" && !match.joiner.charId) {
      await addToOpenMatches(matchId).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // ── Register wager TX ───────────────────────────────────────────────────
  if (action === "wager") {
    for (let attempt = 0; attempt < 5; attempt++) {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
      if (role === "host") {
        match.hostWagerTx = wagerTx ?? null;
        match.hostWagerAmount = wagerAmount ?? null;
      } else {
        match.joinerWagerTx = wagerTx ?? null;
        match.joinerWagerAmount = wagerAmount ?? null;
      }
      try {
        await setMatch(matchId, match);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      }
    }
    return NextResponse.json({ ok: true });
  }

  // ── Quit match ──────────────────────────────────────────────────────────
  if (action === "quit") {
    for (let attempt = 0; attempt < 5; attempt++) {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return NextResponse.json({ ok: true });
      match.abortedBy = role;
      match.lastActivity = Date.now();
      try {
        await setMatch(matchId, match);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      }
    }
    await removeFromOpenMatches(matchId).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // ── Submit card order (with retry to handle concurrency) ────────────────
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

  let match: ServerMatch | null = null;
  let saved = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    match = await getMatch<ServerMatch>(matchId);
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    match.lastActivity = Date.now();

    // Reset slots if moving to a new round
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

    const m = match;
    // Check if both players have submitted for the current round
    if (
      m.host.cardIds &&
      m.joiner.cardIds &&
      m.host.orderRound === m.round &&
      m.joiner.orderRound === m.round
    ) {
      const hostChar   = CHARACTERS.find((c) => c.id === m.host.charId);
      const joinerChar = CHARACTERS.find((c) => c.id === m.joiner.charId);

      if (!hostChar || !joinerChar) {
        return NextResponse.json({ error: "Character data missing — re-select characters" }, { status: 422 });
      }

      const hostCards = m.host.cardIds
        .map((id) => CARDS.find((c) => c.id === id))
        .filter(Boolean) as typeof CARDS;
      const joinerCards = m.joiner.cardIds
        .map((id) => CARDS.find((c) => c.id === id))
        .filter(Boolean) as typeof CARDS;

      const result = resolveRound(hostCards, joinerCards, hostChar, joinerChar);
      m.resolvedSlots = result.slots;

      if (result.roundWinner === "player") m.hostWins++;
      else if (result.roundWinner === "opponent") m.joinerWins++;

      // Check for match completion
      const isMatchOver = m.hostWins >= 3 || m.joinerWins >= 3;
      if (isMatchOver) {
        const hostWon = m.hostWins >= 3;
        if (m.host.address) {
          await recordMatchResult({
            playerAddress: m.host.address,
            playerName: m.host.playerName || undefined,
            won: hostWon,
            pointsEarned: hostWon ? 150 : 25,
            wagered: !!m.hostWagerTx,
          });
        }
        if (m.joiner.address) {
          await recordMatchResult({
            playerAddress: m.joiner.address,
            playerName: m.joiner.playerName || undefined,
            won: !hostWon,
            pointsEarned: !hostWon ? 150 : 25,
            wagered: !!m.joinerWagerTx,
          });
        }
      }
    }

    try {
      await setMatch(matchId, match);
      saved = true;
      break; // Success!
    } catch {
      // Small random delay before retry
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }

  if (!saved) {
    return NextResponse.json({ error: "Failed to save card order — please try again" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, round: match?.round });
}

// DELETE — clean up a finished or abandoned match
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  await deleteMatch(matchId);
  return NextResponse.json({ ok: true });
}

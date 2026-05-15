export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveRound, SlotResult } from "../../../lib/combatEngine";
import { CARDS, CHARACTERS } from "../../../lib/gameData";
import {
  getActiveMatchIdForAddress,
  getMatch,
  setMatch,
  deleteMatch,
  addToOpenMatches,
  removeFromOpenMatches,
  setActiveMatchForAddress,
  clearActiveMatchForAddress,
} from "../../../lib/redis";
import { redis } from "../../../lib/redis";
import { recordMatchResult, recordMatchHistory } from "../../../lib/leaderboard";
import { MultiplayerMode, isRankedMultiplayerMode } from "../../../lib/matchmaking";
import { recordRankedMatchTelemetry, recordRankedRoundTelemetry } from "../../../lib/rankedTelemetry";
import { ServerMatch, newServerMatch, closeJoinWindow, isJoinWindowOpen, reopenJoinWindow, WagerCurrency } from "../../../lib/serverMatch";
import { sendTelegramNewMatchAlert } from "../../../lib/telegram";
import { claimCardProgressRound, recordResolvedCardPerformance } from "../../../lib/cardProgressServer";
import { sanitizePlayerName } from "../../../lib/rateLimit";

const ROUND_GRACE_MS = 30 * 1000; // grace when one player has submitted and the other is reconnecting

function validRole(role: unknown): role is "host" | "joiner" {
  return role === "host" || role === "joiner";
}

function validMode(mode: unknown): mode is MultiplayerMode {
  return mode === "wager" || mode === "ranked" || mode === "tournament";
}

function modeNeedsEntryTx(mode: MultiplayerMode): boolean {
  return mode === "wager" || mode === "ranked";
}

function validWagerCurrency(currency: unknown): currency is WagerCurrency {
  return currency === "cusd" || currency === "celo" || currency === "gdollar" || currency === "usdt";
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
    playerAttunementBoosted: s.opponentAttunementBoosted,
    opponentAttunementBoosted: s.playerAttunementBoosted,
    playerEffectivePriority: s.opponentEffectivePriority,
    opponentEffectivePriority: s.playerEffectivePriority,
  }));
}

// ── Route helpers ──────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ matchId: string }> };

async function closePreviousHostRoom(address: string, currentMatchId: string): Promise<void> {
  const previousMatchId = await getActiveMatchIdForAddress(address).catch(() => null);
  if (!previousMatchId || previousMatchId === currentMatchId) return;

  const previousMatch = await getMatch<ServerMatch>(previousMatchId).catch(() => null);
  if (
    !previousMatch ||
    previousMatch.host.address?.toLowerCase() !== address.toLowerCase() ||
    previousMatch.joiner.charId ||
    previousMatch.completedAt ||
    previousMatch.abortedBy
  ) {
    return;
  }

  closeJoinWindow(previousMatch);
  await setMatch(previousMatchId, previousMatch).catch(() => {});
  await removeFromOpenMatches(previousMatchId).catch(() => {});
}

// GET — poll match state
export async function GET(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  const role = req.nextUrl.searchParams.get("role") as "host" | "joiner" | null;

  let match = await getMatch<ServerMatch>(matchId);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const joinInviteExpired =
    role === "joiner" &&
    !match.joiner.charId &&
    !isJoinWindowOpen(match);
  if (joinInviteExpired) {
    await removeFromOpenMatches(matchId).catch(() => {});
    return NextResponse.json({ error: "Match invite is inactive. Ask the host to resume it first." }, { status: 410 });
  }

  const self = role === "host" ? match.host : match.joiner;
  const other = role === "host" ? match.joiner : match.host;
  const opponentCharId = other.charId;

  let phase: "waiting-for-opponent" | "resolved" | "lobby";
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
  const oneSubmittedThisRound =
    (match.host.orderRound === match.round && !!match.host.cardIds) !==
    (match.joiner.orderRound === match.round && !!match.joiner.cardIds);
  const submitStartedAt = match.roundSubmitStartedAt ?? null;
  const graceRemainingMs = oneSubmittedThisRound && submitStartedAt
    ? Math.max(0, ROUND_GRACE_MS - (Date.now() - submitStartedAt))
    : 0;
  const opponentReconnecting = oneSubmittedThisRound && graceRemainingMs > 0;

  return NextResponse.json({
    round: match.round,
    opponentCharId,
    opponentName: other.playerName,
    selfCharId: self.charId,
    selfCardIds: self.orderRound === match.round ? self.cardIds : null,
    phase,
    slots,
    hostWins:        role === "host" ? match.hostWins   : match.joinerWins,
    opponentWins:    role === "host" ? match.joinerWins : match.hostWins,
    selfWagered:     role === "host" ? !!match.hostWagerTx   : !!match.joinerWagerTx,
    opponentWagered: role === "host" ? !!match.joinerWagerTx : !!match.hostWagerTx,
    selfWagerCurrency: role === "host" ? match.hostWagerCurrency : match.joinerWagerCurrency,
    opponentWagerCurrency: role === "host" ? match.joinerWagerCurrency : match.hostWagerCurrency,
    requiredWagerCurrency: role === "joiner" ? match.hostWagerCurrency : match.joinerWagerCurrency,
    requiredWagerAmount: role === "joiner" ? match.hostWagerAmount : match.joinerWagerAmount,
    hostWagerAmount: match.hostWagerAmount,
    abortedBy:       match.abortedBy ?? null,
    mode:            match.mode,
    paymentRequired: modeNeedsEntryTx(match.mode),
    opponentReconnecting,
    graceRemainingMs,
  });
}

// POST — register character
export async function POST(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, characterId, playerName, address, wagerTx, wagerAmount, wagerCurrency } = body as { role: unknown; characterId: unknown; playerName?: string; address?: string; wagerTx?: string; wagerAmount?: string; wagerCurrency?: WagerCurrency };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }
  if (typeof characterId !== "string" || !CHARACTERS.find((c) => c.id === characterId)) {
    return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
  }

  const existingMatch = await getMatch<ServerMatch>(matchId);
  if (
    role === "joiner" &&
    existingMatch &&
    !existingMatch.joiner.charId &&
    !isJoinWindowOpen(existingMatch)
  ) {
    await removeFromOpenMatches(matchId).catch(() => {});
    return NextResponse.json({ error: "Match invite is inactive. Ask the host to resume it first." }, { status: 410 });
  }

  let match: ServerMatch | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    match = attempt === 0 ? existingMatch ?? newServerMatch(matchId) : await getMatch<ServerMatch>(matchId) ?? newServerMatch(matchId);
    match.lastActivity = Date.now();
    if (role === "host") {
      reopenJoinWindow(match);
      match.host.charId = characterId;
      const sName = sanitizePlayerName(playerName);
      if (sName) match.host.playerName = sName;
      if (address) match.host.address = address;
      if (match.mode === "wager") {
        if (typeof wagerTx === "string" && !match.hostWagerTx) match.hostWagerTx = wagerTx;
        if (typeof wagerAmount === "string" && !match.hostWagerAmount) match.hostWagerAmount = wagerAmount;
        if (validWagerCurrency(wagerCurrency) && !match.hostWagerCurrency) match.hostWagerCurrency = wagerCurrency;
      }
    } else {
      closeJoinWindow(match);
      match.joiner.charId = characterId;
      const sNameJ = sanitizePlayerName(playerName);
      if (sNameJ) match.joiner.playerName = sNameJ;
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
    // Backup alert path: if keepalive was skipped, notify on first host character registration.
    const notifyKey = `notify:new-match:${matchId}`;
    const shouldNotify = await redis
      .set(notifyKey, "1", { nx: true, ex: 7200 })
      .then((v) => !!v)
      .catch(() => true);
    if (shouldNotify && match) {
      await sendTelegramNewMatchAlert({
        matchId,
        mode: match.mode,
        hostName: match.host.playerName,
        hostAddress: match.host.address,
      }).catch(() => false);
    }
  } else if (role === "joiner") {
    await removeFromOpenMatches(matchId).catch(() => {});
  }

  const activeAddress = role === "host" ? match?.host.address : match?.joiner.address;
  if (activeAddress) {
    if (role === "host") {
      await closePreviousHostRoom(activeAddress, matchId).catch(() => {});
    }
    await setActiveMatchForAddress(activeAddress, matchId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// PATCH — wager registration OR card order submission
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, cardIds, round, action, wagerTx, wagerAmount, wagerCurrency, playerName: patchPlayerName, address: patchAddress, mode: requestedMode, attunedCardIds } = body as {
    role: unknown;
    cardIds: unknown;
    round: unknown;
    action?: string;
    wagerTx?: string;
    wagerAmount?: string;
    wagerCurrency?: WagerCurrency;
    playerName?: string;
    address?: string;
    mode?: MultiplayerMode;
    attunedCardIds?: string[];
  };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }

  // ── Keepalive (host waiting on ready page) ──────────────────────────────
  if (action === "keepalive") {
    let match = await getMatch<ServerMatch>(matchId);
    if (!match) {
      // Match doesn't exist yet — create it now so it appears in open matches
      match = newServerMatch(matchId, validMode(requestedMode) ? requestedMode : "wager");
    }
    match.lastActivity = Date.now();
    // Store player name and address if either side reconnects before character selection.
    const playerSlot = role === "host" ? match.host : match.joiner;
    const sanitizedPatchName = sanitizePlayerName(patchPlayerName);
    if (sanitizedPatchName && !playerSlot.playerName) {
      playerSlot.playerName = sanitizedPatchName;
    }
    if (typeof patchAddress === "string" && patchAddress && !playerSlot.address) {
      playerSlot.address = patchAddress;
    }
    if (validMode(requestedMode)) match.mode = requestedMode;
    if (role === "host" && !match.joiner.charId && !match.completedAt && !match.abortedBy) {
      reopenJoinWindow(match);
    }
    await setMatch(matchId, match).catch(() => {});
    const activeAddress = role === "host" ? match.host.address : match.joiner.address;
    if (activeAddress) {
      if (role === "host") {
        await closePreviousHostRoom(activeAddress, matchId).catch(() => {});
      }
      await setActiveMatchForAddress(activeAddress, matchId).catch(() => {});
    }
    if (role === "host") {
      // Robust one-time alert per match id, even if the match was created before keepalive.
      const notifyKey = `notify:new-match:${matchId}`;
      const shouldNotify = await redis
        .set(notifyKey, "1", { nx: true, ex: 7200 })
        .then((v) => !!v)
        // Fail open: if Redis lock is unavailable, still send alert.
        .catch(() => true);
      if (shouldNotify) {
        await sendTelegramNewMatchAlert({
          matchId,
          mode: match.mode,
          hostName: match.host.playerName,
          hostAddress: match.host.address,
        }).catch(() => false);
      }
    }
    // Keep the match visible in open matches while waiting for a joiner
    if (validRole(role) && role === "host" && !match.joiner.charId) {
      await addToOpenMatches(matchId).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // ── Register wager TX ───────────────────────────────────────────────────
  if (action === "wager") {
    if (!validWagerCurrency(wagerCurrency)) {
      return NextResponse.json({ error: "Invalid wager currency" }, { status: 400 });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
      if (match.mode !== "wager") {
        return NextResponse.json({ error: "Wager registration is only valid for wager matches" }, { status: 409 });
      }
      match.lastActivity = Date.now();
      const opponentCurrency = role === "host" ? match.joinerWagerCurrency : match.hostWagerCurrency;
      const opponentAmount = role === "host" ? match.joinerWagerAmount : match.hostWagerAmount;

      if (opponentCurrency && opponentCurrency !== wagerCurrency) {
        return NextResponse.json({ error: "Wager matches require both players to stake the same token." }, { status: 409 });
      }
      if (typeof wagerAmount === "string" && opponentAmount && opponentAmount !== wagerAmount) {
        return NextResponse.json({ error: "Wager matches require both players to stake the same amount." }, { status: 409 });
      }

      if (role === "host") {
        match.hostWagerTx = wagerTx ?? null;
        match.hostWagerAmount = wagerAmount ?? null;
        match.hostWagerCurrency = wagerCurrency;
      } else {
        match.joinerWagerTx = wagerTx ?? null;
        match.joinerWagerAmount = wagerAmount ?? null;
        match.joinerWagerCurrency = wagerCurrency;
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
    let abortedMatch: ServerMatch | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return NextResponse.json({ ok: true });
      match.abortedBy = role;
      match.lastActivity = Date.now();
      closeJoinWindow(match);
      try {
        await setMatch(matchId, match);
        abortedMatch = match;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      }
    }
    await removeFromOpenMatches(matchId).catch(() => {});
    if (abortedMatch?.host.address) {
      await clearActiveMatchForAddress(abortedMatch.host.address, matchId).catch(() => {});
    }
    if (abortedMatch?.joiner.address) {
      await clearActiveMatchForAddress(abortedMatch.joiner.address, matchId).catch(() => {});
    }
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
  // Captured after match state is saved — fired once outside the retry loop
  let matchEndSnapshot: { hostWon: boolean; m: ServerMatch } | null = null;
  let roundTelemetrySnapshot: {
    hostCharId: string;
    joinerCharId: string;
    hostCardIds: string[];
    joinerCardIds: string[];
    hostWonRound: boolean | null;
    roundDurationMs: number;
    round: number;
  } | null = null;
  let roundProgressSnapshot: {
    round: number;
    slots: SlotResult[];
    hostAddress: string | null;
    joinerAddress: string | null;
    hostUsedCardIds: string[];
    joinerUsedCardIds: string[];
    hostWonMatch: boolean;
    joinerWonMatch: boolean;
  } | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    match = await getMatch<ServerMatch>(matchId);
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    match.lastActivity = Date.now();
    closeJoinWindow(match);

    // Reset slots if moving to a new round
    if (round > match.round) {
      match.round = round;
      match.host.cardIds = null;
      match.host.orderRound = 0;
      match.joiner.cardIds = null;
      match.joiner.orderRound = 0;
      match.resolvedSlots = null;
      match.roundSubmitStartedAt = null;
    }

    const slot = role === "host" ? match.host : match.joiner;
    slot.cardIds = cardIds;
    slot.usedCardIdsThisMatch = Array.from(new Set([...(slot.usedCardIdsThisMatch ?? []), ...cardIds]));
    slot.orderRound = round;
    slot.attunedCardIds = Array.isArray(attunedCardIds) ? Array.from(new Set(attunedCardIds.filter((id): id is string => typeof id === "string"))).slice(0, 2) : [];
    if (!match.roundSubmitStartedAt) {
      match.roundSubmitStartedAt = Date.now();
    }

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

      const roundDurationMs = match.roundSubmitStartedAt ? Math.max(0, Date.now() - match.roundSubmitStartedAt) : 0;
      const result = resolveRound(hostCards, joinerCards, hostChar, joinerChar, {
        playerAttunedCardIds: m.host.attunedCardIds,
        opponentAttunedCardIds: m.joiner.attunedCardIds,
        playerAttunementBoostAvailable: m.host.attunedCardIds.length > 0 && !m.host.attunementSurgeUsed,
        opponentAttunementBoostAvailable: m.joiner.attunedCardIds.length > 0 && !m.joiner.attunementSurgeUsed,
      });
      m.resolvedSlots = result.slots;
      m.roundSubmitStartedAt = null;
      if (result.slots.some((slotResult) => slotResult.playerAttunementBoosted)) {
        m.host.attunementSurgeUsed = true;
      }
      if (result.slots.some((slotResult) => slotResult.opponentAttunementBoosted)) {
        m.joiner.attunementSurgeUsed = true;
      }
      roundTelemetrySnapshot = {
        hostCharId: hostChar.id,
        joinerCharId: joinerChar.id,
        hostCardIds: m.host.cardIds,
        joinerCardIds: m.joiner.cardIds,
        hostWonRound: result.roundWinner === "player" ? true : result.roundWinner === "opponent" ? false : null,
        roundDurationMs,
        round: m.round,
      };

      if (result.roundWinner === "player") m.hostWins++;
      else if (result.roundWinner === "opponent") m.joinerWins++;

      if (m.hostWins >= 3 || m.joinerWins >= 3) {
        m.completedAt = Date.now();
        m.winnerAddress = m.hostWins >= 3 ? m.host.address : m.joiner.address;
        matchEndSnapshot = { hostWon: m.hostWins >= 3, m: { ...m, host: { ...m.host }, joiner: { ...m.joiner } } };
      }
      roundProgressSnapshot = {
        round: m.round,
        slots: result.slots,
        hostAddress: m.host.address,
        joinerAddress: m.joiner.address,
        hostUsedCardIds: [...(m.host.usedCardIdsThisMatch ?? [])],
        joinerUsedCardIds: [...(m.joiner.usedCardIdsThisMatch ?? [])],
        hostWonMatch: m.hostWins >= 3,
        joinerWonMatch: m.joinerWins >= 3,
      };
    }

    try {
      await setMatch(matchId, match);
      saved = true;
      break; // Success!
    } catch {
      matchEndSnapshot = null; // reset — will be re-computed on next attempt
      // Small random delay before retry
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }

  if (
    saved &&
    roundTelemetrySnapshot &&
    match &&
    isRankedMultiplayerMode(match.mode) &&
    match.host.address &&
    match.joiner.address
  ) {
    try {
      await recordRankedRoundTelemetry({
        matchId,
        round: roundTelemetrySnapshot.round,
        hostCharId: roundTelemetrySnapshot.hostCharId,
        joinerCharId: roundTelemetrySnapshot.joinerCharId,
        hostCardIds: roundTelemetrySnapshot.hostCardIds,
        joinerCardIds: roundTelemetrySnapshot.joinerCardIds,
        hostWonRound: roundTelemetrySnapshot.hostWonRound,
        roundDurationMs: roundTelemetrySnapshot.roundDurationMs,
      });
    } catch {
      // Best-effort only.
    }
  }

  if (saved && roundProgressSnapshot) {
    try {
      const claimed = await claimCardProgressRound(matchId, roundProgressSnapshot.round);
      if (claimed) {
        if (roundProgressSnapshot.hostAddress) {
          await recordResolvedCardPerformance({
            address: roundProgressSnapshot.hostAddress,
            perspective: "player",
            slots: roundProgressSnapshot.slots,
            matchWon: roundProgressSnapshot.hostWonMatch,
            usedCardIdsForMatchWin: roundProgressSnapshot.hostUsedCardIds,
          });
        }
        if (roundProgressSnapshot.joinerAddress) {
          await recordResolvedCardPerformance({
            address: roundProgressSnapshot.joinerAddress,
            perspective: "opponent",
            slots: roundProgressSnapshot.slots,
            matchWon: roundProgressSnapshot.joinerWonMatch,
            usedCardIdsForMatchWin: roundProgressSnapshot.joinerUsedCardIds,
          });
        }
      }
    } catch {
      // Best-effort only.
    }
  }

  // Fire leaderboard writes once, after the match state is confirmed saved.
  // Wrapped in try/catch so a Redis blip here never breaks the card submission response.
  if (matchEndSnapshot) {
    const { hostWon, m } = matchEndSnapshot;
    const now = new Date().toISOString();
    try {
      if (m.host.address && isRankedMultiplayerMode(m.mode)) {
        await recordMatchResult({
          playerAddress: m.host.address,
          playerName: m.host.playerName || undefined,
          won: hostWon,
          pointsEarned: hostWon ? 150 : 25,
          leaderboard: "ranked",
        });
      }
      if (m.host.address && m.host.charId && m.joiner.charId) {
        await recordMatchHistory(m.host.address, {
          id: matchId,
          date: now,
          playerCharId: m.host.charId,
          opponentCharId: m.joiner.charId,
          outcome: hostWon ? "win" : "loss",
          pointsEarned: hostWon ? 150 : 25,
          playerRoundsWon: m.hostWins,
          opponentRoundsWon: m.joinerWins,
        });
      }
      if (m.joiner.address && isRankedMultiplayerMode(m.mode)) {
        await recordMatchResult({
          playerAddress: m.joiner.address,
          playerName: m.joiner.playerName || undefined,
          won: !hostWon,
          pointsEarned: !hostWon ? 150 : 25,
          leaderboard: "ranked",
        });
      }
      if (m.joiner.address && m.joiner.charId && m.host.charId) {
        await recordMatchHistory(m.joiner.address, {
          id: matchId,
          date: now,
          playerCharId: m.joiner.charId,
          opponentCharId: m.host.charId,
          outcome: hostWon ? "loss" : "win",
          pointsEarned: hostWon ? 25 : 150,
          playerRoundsWon: m.joinerWins,
          opponentRoundsWon: m.hostWins,
        });
      }
      if (
        m.host.address &&
        m.joiner.address &&
        m.host.charId &&
        m.joiner.charId &&
        m.completedAt &&
        isRankedMultiplayerMode(m.mode)
      ) {
        await recordRankedMatchTelemetry({
          matchId,
          hostAddress: m.host.address,
          joinerAddress: m.joiner.address,
          hostCharId: m.host.charId,
          joinerCharId: m.joiner.charId,
          hostWonMatch: hostWon,
          createdAt: m.createdAt,
          completedAt: m.completedAt,
        });
      }
    } catch {
      // Best-effort — leaderboard failure must not break the card submission
    }
    if (m.host.address) {
      await clearActiveMatchForAddress(m.host.address, matchId).catch(() => {});
    }
    if (m.joiner.address) {
      await clearActiveMatchForAddress(m.joiner.address, matchId).catch(() => {});
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
  const match = await getMatch<ServerMatch>(matchId);
  await deleteMatch(matchId);
  await removeFromOpenMatches(matchId).catch(() => {});
  if (match?.host.address) {
    await clearActiveMatchForAddress(match.host.address, matchId).catch(() => {});
  }
  if (match?.joiner.address) {
    await clearActiveMatchForAddress(match.joiner.address, matchId).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

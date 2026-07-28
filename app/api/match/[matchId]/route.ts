export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveRound, SlotResult, calcEnergyPool } from "../../../lib/combatEngine";
import { CARDS, CHARACTERS } from "../../../lib/gameData";
import {
  getActiveMatchIdForAddress,
  getMatch,
  setMatch,
  deleteMatch,
  addToOpenMatches,
  removeFromOpenMatches,
  removeOpenMatchSummary,
  setActiveMatchForAddress,
  clearActiveMatchForAddress,
  setOpenMatchSummary,
} from "../../../lib/redis";
import { redis } from "../../../lib/redis";
import { recordMatchResult, recordMatchHistory, recordPlayerMatchOutcome } from "../../../lib/leaderboard";
import { withMatchLock } from "../../../lib/matchLock";
import { MultiplayerMode, isRankedMultiplayerMode } from "../../../lib/matchmaking";
import { recordRankedMatchTelemetry, recordRankedRoundTelemetry } from "../../../lib/rankedTelemetry";
import { ServerMatch, newServerMatch, closeJoinWindow, isJoinWindowOpen, reopenJoinWindow, WagerCurrency } from "../../../lib/serverMatch";
import { sendTelegramNewMatchAlert } from "../../../lib/telegram";
import { attributeStakeOnChain } from "../../../lib/arenaV2Server";
import { ARENA_V2_ACTIVE } from "../../../lib/arenaV2";
import { WAGERS_ENABLED } from "../../../lib/wagerConfig";
import { MatchAction, MatchActionAuth, verifyMatchActionSignature } from "../../../lib/matchAuth";
import { claimCardProgressRound, recordResolvedCardPerformance } from "../../../lib/cardProgressServer";
import { sanitizePlayerName } from "../../../lib/rateLimit";
import type { OpenMatchSummary } from "../../../lib/redis";

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

function buildOpenMatchSummary(matchId: string, match: ServerMatch): OpenMatchSummary {
  return {
    id: matchId,
    hostName: match.host.playerName ?? null,
    hostAddress: match.host.address ?? null,
    createdAt: match.createdAt,
    mode: match.mode,
    hostCharSelected: !!match.host.charId,
  };
}

function validWagerCurrency(currency: unknown): currency is WagerCurrency {
  return currency === "cusd" || currency === "celo" || currency === "gdollar" || currency === "usdt" || currency === "usdc";
}

// Only escrow-backed wagers are allowed: the three stablecoins that stake into
// the verified KnockOrderArenaV2 contract, whose payout binds to real on-chain
// participants and amounts. G$ and native CELO settle straight from the
// treasury with no escrow, so their winner/pot can't be trusted — reject them
// at creation so no unescrowed wager can exist.
const ESCROW_WAGER_CURRENCIES = new Set<WagerCurrency>(["usdt", "usdc", "cusd"]);
function isEscrowWagerCurrency(currency: unknown): currency is WagerCurrency {
  return ARENA_V2_ACTIVE && validWagerCurrency(currency) && ESCROW_WAGER_CURRENCIES.has(currency);
}

function authAddress(auth: unknown): string | null {
  if (!auth || typeof auth !== "object") return null;
  const address = (auth as MatchActionAuth).address;
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : null;
}

async function requireWagerActionAuth(params: {
  matchId: string;
  role: "host" | "joiner";
  action: MatchAction;
  round?: number;
  payload: Record<string, unknown>;
  auth: unknown;
  expectedAddress?: string | null;
}): Promise<NextResponse | null> {
  const authBody = params.auth && typeof params.auth === "object" ? params.auth as MatchActionAuth : null;
  const wallet = authAddress(authBody);
  const signature = authBody?.signature;
  const issuedAt = Number(authBody?.issuedAt);
  if (!wallet || !signature || !Number.isFinite(issuedAt)) {
    return NextResponse.json({ error: "Signed match action required" }, { status: 401 });
  }
  if (params.expectedAddress && wallet !== params.expectedAddress.toLowerCase()) {
    return NextResponse.json({ error: "Signed wallet does not match player slot" }, { status: 403 });
  }
  const ok = await verifyMatchActionSignature({
    wallet,
    matchId: params.matchId,
    role: params.role,
    action: params.action,
    round: params.round,
    payload: params.payload,
    issuedAt,
    signature,
  });
  return ok ? null : NextResponse.json({ error: "Invalid match action signature" }, { status: 401 });
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
  await Promise.allSettled([
    removeFromOpenMatches(previousMatchId),
    removeOpenMatchSummary(previousMatchId),
  ]);
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
    await Promise.allSettled([
      removeFromOpenMatches(matchId),
      removeOpenMatchSummary(matchId),
    ]);
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
    selfCardIds: match.mode === "wager" && !match.resolvedSlots ? null : self.orderRound === match.round ? self.cardIds : null,
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
  return withMatchLock(matchId, () => postImpl(req, ctx),
    () => NextResponse.json({ error: "Match is busy — please retry" }, { status: 409 }));
}

async function postImpl(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, characterId, playerName, address, wagerTx, wagerAmount, wagerCurrency, matchAuth } = body as { role: unknown; characterId: unknown; playerName?: string; address?: string; wagerTx?: string; wagerAmount?: string; wagerCurrency?: WagerCurrency; matchAuth?: MatchActionAuth };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }
  if (typeof characterId !== "string" || !CHARACTERS.find((c) => c.id === characterId)) {
    return NextResponse.json({ error: "Invalid characterId" }, { status: 400 });
  }

  const existingMatch = await getMatch<ServerMatch>(matchId);
  if (existingMatch?.mode === "wager" && !WAGERS_ENABLED) {
    return NextResponse.json({ error: "Wagers are currently unavailable." }, { status: 403 });
  }
  if (existingMatch?.mode === "wager" || wagerTx || wagerAmount || wagerCurrency) {
    if (!address) return NextResponse.json({ error: "Address required for signed wager match action" }, { status: 400 });
    const authError = await requireWagerActionAuth({
      matchId,
      role,
      action: "character",
      payload: { characterId, playerName, address: address.toLowerCase(), wagerTx, wagerAmount, wagerCurrency },
      auth: matchAuth,
      expectedAddress: address,
    });
    if (authError) return authError;
  }
  if (
    role === "joiner" &&
    existingMatch &&
    !existingMatch.joiner.charId &&
    !isJoinWindowOpen(existingMatch)
  ) {
    await Promise.allSettled([
      removeFromOpenMatches(matchId),
      removeOpenMatchSummary(matchId),
    ]);
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
      if (match.mode === "wager" && WAGERS_ENABLED) {
        // Only escrow-backed stablecoins may be recorded as a wager currency.
        if (wagerCurrency !== undefined && !isEscrowWagerCurrency(wagerCurrency)) {
          return NextResponse.json({ error: "Wagers are only available in escrow-backed stablecoins (USDT, USDC, USDm)." }, { status: 400 });
        }
        if (typeof wagerTx === "string" && !match.hostWagerTx) match.hostWagerTx = wagerTx;
        if (typeof wagerAmount === "string" && !match.hostWagerAmount) match.hostWagerAmount = wagerAmount;
        if (isEscrowWagerCurrency(wagerCurrency) && !match.hostWagerCurrency) match.hostWagerCurrency = wagerCurrency;
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
    if (match) {
      await Promise.allSettled([
        addToOpenMatches(matchId),
        setOpenMatchSummary(buildOpenMatchSummary(matchId, match)),
      ]);
    }
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
    await Promise.allSettled([
      removeFromOpenMatches(matchId),
      removeOpenMatchSummary(matchId),
    ]);
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
  return withMatchLock(matchId, () => patchImpl(req, ctx),
    () => NextResponse.json({ error: "Match is busy — please retry" }, { status: 409 }));
}

async function patchImpl(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { role, cardIds, round, action, wagerTx, wagerAmount, wagerCurrency, playerName: patchPlayerName, address: patchAddress, mode: requestedMode, attunedCardIds, matchAuth } = body as {
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
    matchAuth?: MatchActionAuth;
  };

  if (!validRole(role)) {
    return NextResponse.json({ error: "role must be 'host' or 'joiner'" }, { status: 400 });
  }

  // ── Keepalive (host waiting on ready page) ──────────────────────────────
  // Server-side wager kill-switch (default off): a real boundary that direct
  // API calls can't bypass, unlike the UI gate. No new wager match can be
  // created or kept alive while wagers are disabled.
  if (requestedMode === "wager" && !WAGERS_ENABLED) {
    return NextResponse.json({ error: "Wagers are currently unavailable." }, { status: 403 });
  }

  if (action === "keepalive") {
    let match = await getMatch<ServerMatch>(matchId);
    if ((match?.mode === "wager" || requestedMode === "wager") && WAGERS_ENABLED) {
      const expectedAddress = typeof patchAddress === "string" ? patchAddress : match?.[role].address;
      const authError = await requireWagerActionAuth({
        matchId,
        role,
        action: "keepalive",
        payload: { playerName: patchPlayerName, address: expectedAddress?.toLowerCase(), mode: requestedMode },
        auth: matchAuth,
        expectedAddress,
      });
      if (authError) return authError;
    }
    if (!match) {
      // Match doesn't exist yet — create it now so it appears in open matches.
      // Default a modeless keepalive to ranked (not wager) so a missing mode
      // can never silently spin up a wager match.
      match = newServerMatch(matchId, validMode(requestedMode) ? requestedMode : "ranked");
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
      await Promise.allSettled([
        addToOpenMatches(matchId),
        setOpenMatchSummary(buildOpenMatchSummary(matchId, match)),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Register wager TX ───────────────────────────────────────────────────
  if (action === "wager") {
    if (!WAGERS_ENABLED) {
      return NextResponse.json({ error: "Wagers are currently unavailable." }, { status: 403 });
    }
    if (!isEscrowWagerCurrency(wagerCurrency)) {
      return NextResponse.json({ error: "Wagers are only available in escrow-backed stablecoins (USDT, USDC, USDm)." }, { status: 400 });
    }
    if (!patchAddress) return NextResponse.json({ error: "Address required for signed wager registration" }, { status: 400 });
    const authError = await requireWagerActionAuth({
      matchId,
      role,
      action: "wager",
      payload: { address: patchAddress.toLowerCase(), wagerTx, wagerAmount, wagerCurrency },
      auth: matchAuth,
      expectedAddress: patchAddress,
    });
    if (authError) return authError;
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
        return NextResponse.json({ error: "Wager matches require both players to stake the same currency." }, { status: 409 });
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

    // Attribute the stake on the verified ArenaV2 escrow contract, waiting for
    // the receipt. There is no treasury fallback: if attribution hasn't landed
    // by payout time, the payout route retries it from the recorded tx and
    // refuses to settle without an Active escrow match.
    let escrowAttributed = false;
    if (wagerTx && patchAddress && typeof wagerAmount === "string") {
      escrowAttributed = await attributeStakeOnChain({
        matchId,
        player: patchAddress,
        currency: wagerCurrency,
        amount: wagerAmount,
        txHash: wagerTx,
      });
    }
    return NextResponse.json({ ok: true, escrowAttributed });
  }

  // ── Quit match ──────────────────────────────────────────────────────────
  if (action === "quit") {
    let abortedMatch: ServerMatch | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const match = await getMatch<ServerMatch>(matchId);
      if (!match) return NextResponse.json({ ok: true });
      if (match.mode === "wager") {
        const slotAddress = match[role].address;
        const authError = await requireWagerActionAuth({
          matchId,
          role,
          action: "quit",
          payload: {},
          auth: matchAuth,
          expectedAddress: slotAddress,
        });
        if (authError) return authError;
      }
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
    await Promise.allSettled([
      removeFromOpenMatches(matchId),
      removeOpenMatchSummary(matchId),
    ]);
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
  // Server-side deck legality (M-05): a legal deck is 5 distinct cards whose
  // total energy fits the submitter's character pool — exactly what the client
  // enforces (gameStore.addCardToSlot). A legitimate client never violates
  // this; rejecting here blocks a forged over-budget or duplicate-stacked deck.
  if (new Set(cardIds as string[]).size !== 5) {
    return NextResponse.json({ error: "A deck must be 5 distinct cards" }, { status: 400 });
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
    if (match.mode === "wager") {
      const slotAddress = match[role].address;
      const authError = await requireWagerActionAuth({
        matchId,
        role,
        action: "submit",
        round,
        payload: { cardIds, round, attunedCardIds: Array.isArray(attunedCardIds) ? attunedCardIds : [] },
        auth: matchAuth,
        expectedAddress: slotAddress,
      });
      if (authError) return authError;
    }

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
    // Energy-budget legality (M-05): once the submitter's character is known,
    // the 5 cards' total energy must fit its pool — the same limit the client
    // applies. Skip only if the character isn't registered yet.
    const submitterChar = CHARACTERS.find((c) => c.id === slot.charId);
    if (submitterChar) {
      const energyPool = calcEnergyPool(submitterChar);
      const usedEnergy = (cardIds as string[]).reduce(
        (sum, id) => sum + (CARDS.find((c) => c.id === id)?.energyCost ?? 0), 0);
      if (usedEnergy > energyPool) {
        return NextResponse.json({ error: "Deck exceeds this character's energy budget" }, { status: 400 });
      }
    }
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
      // Server-authoritative daily/streak progression for both players (M-07).
      if (m.host.address) await recordPlayerMatchOutcome(m.host.address, hostWon);
      if (m.joiner.address) await recordPlayerMatchOutcome(m.joiner.address, !hostWon);
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
    // Increment free game counter for players without an active season pass.
    // Only free/casual play consumes a free game — wager and tournament matches
    // have their own entry/stake and must not burn the free allowance (M-01).
    const consumesFreeGame = m.mode !== "wager" && m.mode !== "tournament";
    const incrementFreeGame = async (addr: string) => {
      const passRaw = await redis.get(`season-pass:${addr.toLowerCase()}`).catch(() => null);
      let hasPass = false;
      if (passRaw) {
        const parsed = typeof passRaw === "string"
          ? (() => { try { return JSON.parse(passRaw) as { expiry?: number }; } catch { return null; } })()
          : passRaw as { expiry?: number } | null;
        if (parsed && Number.isFinite(Number(parsed.expiry)) && Number(parsed.expiry) >= Date.now()) {
          hasPass = true;
        }
      }
      if (!hasPass) {
        const key = `free-games:${addr.toLowerCase()}`;
        const current = Number(await redis.get(key)) || 0;
        if (current < 2) {
          await redis.set(key, current + 1);
        }
      }
    };
    try {
      const freeGamePromises: Promise<void>[] = [];
      if (consumesFreeGame && m.host.address) freeGamePromises.push(incrementFreeGame(m.host.address));
      if (consumesFreeGame && m.joiner.address) freeGamePromises.push(incrementFreeGame(m.joiner.address));
      await Promise.allSettled(freeGamePromises);
    } catch {
      // Best-effort — free game tracking failure must not break match flow
    }

    if (m.host.address) {
      await clearActiveMatchForAddress(m.host.address, matchId).catch(() => {});
    }
    if (m.joiner.address) {
      await clearActiveMatchForAddress(m.joiner.address, matchId).catch(() => {});
    }
    await Promise.allSettled([
      removeFromOpenMatches(matchId),
      removeOpenMatchSummary(matchId),
    ]);
  }

  if (!saved) {
    return NextResponse.json({ error: "Failed to save card order — please try again" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, round: match?.round });
}

// DELETE — clean up a finished or abandoned match
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  return withMatchLock<NextResponse>(matchId, () => deleteImpl(req, ctx),
    () => NextResponse.json({ error: "Match is busy — please retry" }, { status: 409 }));
}

async function deleteImpl(_req: NextRequest, ctx: Ctx) {
  const { matchId } = await ctx.params;
  const match = await getMatch<ServerMatch>(matchId);
  await deleteMatch(matchId);
  await Promise.allSettled([
    removeFromOpenMatches(matchId),
    removeOpenMatchSummary(matchId),
  ]);
  if (match?.host.address) {
    await clearActiveMatchForAddress(match.host.address, matchId).catch(() => {});
  }
  if (match?.joiner.address) {
    await clearActiveMatchForAddress(match.joiner.address, matchId).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

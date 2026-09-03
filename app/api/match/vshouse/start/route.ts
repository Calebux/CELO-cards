import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { CHARACTERS } from "../../../../lib/gameData";
import {
  clampDifficulty,
  gateDifficultyByPremium,
  maxDifficultyForPremiumCount,
} from "../../../../lib/houseDifficulty";
import { readOwnedPremium } from "../../../../lib/premiumOwnership";
import { checkRateLimit, sanitizePlayerName } from "../../../../lib/rateLimit";
import { isAgentKeyRequest } from "../../../../lib/agentKey";
import { registerAgentWallet } from "../../../../lib/agentTrack";

export const dynamic = "force-dynamic";

/**
 * Recorded in place of a deploy id for wallets we learn about through the
 * scoped key rather than the partner API — the skill sends no deploy id, and
 * the registration is still worth keeping with its provenance visible.
 */
const AGENT_SKILL_DEPLOY_ID = "skill:actionorder-player";

/**
 * The shape resolve stores under `match:vshouse:<addr>`. Kept in step with the
 * declaration there — this route only creates it; resolve owns advancing it.
 */
interface HouseMatchState {
  matchId: string;
  playerRoundsWon: number;
  opponentRoundsWon: number;
  roundNumber: number;
  lastUpdated: number;
  attunementSurgeUsed: boolean;
  usedCardIds: string[];
  previousAiOrderIds: string[];
  difficulty: 0 | 1 | 2 | 3;
  maxDifficulty?: 0 | 1 | 2 | 3;
  playerCharacterId?: string;
  opponentCharacterId?: string;
}

/**
 * POST /api/match/vshouse/start — open a vs-house match and pin its difficulty.
 *
 * This is the first half of the contract GoodAgent's `actionorder-player` skill
 * plays against: start pins difficulty and roster, then resolve runs one round
 * per call and deliberately takes no difficulty, so a run cannot be cleared on
 * easy and collected on hard.
 *
 * Resolve still creates state on its first call when nobody called start, so
 * the human client is unaffected by this route existing.
 */
export async function POST(req: NextRequest) {
  let body: {
    matchId?: string;
    playerAddress?: string;
    playerName?: string;
    playerCharacterId?: string;
    opponentCharacterId?: string;
    difficulty?: number;
    wagered?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const playerAddress = typeof body.playerAddress === "string" ? body.playerAddress.trim() : "";
  if (!matchId || !/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
    return NextResponse.json({ error: "matchId and playerAddress required" }, { status: 400 });
  }

  const addr = playerAddress.toLowerCase();
  if (!(await checkRateLimit(`vshouse-start:${addr}`, 30, 60))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const playerChar = CHARACTERS.find((c) => c.id === body.playerCharacterId);
  const opponentChar = CHARACTERS.find((c) => c.id === body.opponentCharacterId);
  if (!playerChar || !opponentChar) {
    return NextResponse.json({ error: "Unknown character" }, { status: 400 });
  }

  // The agent key is the only thing allowed to declare a wallet agent-operated
  // — a body flag would let anyone pick the board they score on. Registering
  // here means every match this skill starts is on the agent track before its
  // first round is scored, without the registry having to guess later.
  const fromAgent = isAgentKeyRequest(req);
  if (fromAgent) {
    try {
      await registerAgentWallet(addr, AGENT_SKILL_DEPLOY_ID, null);
    } catch {
      // A registry we cannot write must not let the match score as human.
      return NextResponse.json({ error: "AGENT_REGISTRY_UNAVAILABLE" }, { status: 503 });
    }
  }

  // Hard and Boss are bought into, so the tier this match pins is capped by the
  // premium cards the wallet owns. Agents are exempt — they buy nothing and
  // score on their own board, so gating them would close the lane rather than
  // sell a card. Resolve applies the same gate when it opens a match itself, so
  // skipping start cannot skip this.
  const requested = clampDifficulty(body.difficulty ?? 0);
  const ownedPremiumCount = fromAgent ? 0 : (await readOwnedPremium(addr)).length;
  // Pinned for the life of the match so resolve needs no further lookup, and a
  // card bought mid-run cannot upgrade a match already in play.
  const maxDifficulty: 0 | 1 | 2 | 3 = fromAgent ? 3 : maxDifficultyForPremiumCount(ownedPremiumCount);
  const difficulty = fromAgent ? requested : gateDifficultyByPremium(requested, ownedPremiumCount);
  const state: HouseMatchState = {
    matchId,
    playerRoundsWon: 0,
    opponentRoundsWon: 0,
    roundNumber: 1,
    lastUpdated: Date.now(),
    attunementSurgeUsed: false,
    usedCardIds: [],
    previousAiOrderIds: [],
    difficulty,
    maxDifficulty,
    // Pinned so resolve can run without them: the skill's resolve body carries
    // only the card order, by design.
    playerCharacterId: playerChar.id,
    opponentCharacterId: opponentChar.id,
  };
  await redis.set(`match:vshouse:${addr}`, state, { ex: 3600 });

  return NextResponse.json({
    ok: true,
    matchId,
    difficulty,
    // Set when the requested tier was above what this wallet has unlocked. The
    // match still opens — at the tier they can play — rather than failing.
    difficultyGated: difficulty < requested ? { requested, granted: difficulty } : null,
    playerCharacterId: playerChar.id,
    opponentCharacterId: opponentChar.id,
    playerName: sanitizePlayerName(body.playerName ?? "") ?? null,
    agent: fromAgent,
  });
}

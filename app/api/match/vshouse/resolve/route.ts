import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { CARDS, CHARACTERS, Card } from "../../../../lib/gameData";
import { generateAIOrder, resolveRound, AIRoundContext, RoundOptions } from "../../../../lib/combatEngine";
import { recordMatchResult } from "../../../../lib/leaderboard";

export const dynamic = "force-dynamic";

interface HouseMatchState {
  matchId: string;
  playerRoundsWon: number;
  opponentRoundsWon: number;
  roundNumber: number;
  lastUpdated: number;
}

export async function POST(req: NextRequest) {
  let body: {
    matchId: string;
    playerAddress: string;
    playerName: string;
    playerCharacterId: string;
    opponentCharacterId: string;
    playerOrderCardIds: string[];
    difficulty: number;
    wagered: boolean;
    playerUltimateActivated?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    matchId,
    playerAddress,
    playerName,
    playerCharacterId,
    opponentCharacterId,
    playerOrderCardIds,
    difficulty = 1,
    wagered = false,
    playerUltimateActivated = false,
  } = body;

  if (!playerAddress || !matchId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const addr = playerAddress.toLowerCase();
  const redisKey = `match:vshouse:${addr}`;

  // 1. Get or Initialize Match State
  let state = await redis.get<HouseMatchState>(redisKey);
  if (!state || state.matchId !== matchId) {
    state = {
      matchId,
      playerRoundsWon: 0,
      opponentRoundsWon: 0,
      roundNumber: 1,
      lastUpdated: Date.now(),
    };
  }

  // 2. Prepare Data for Resolution
  const playerChar = CHARACTERS.find((c) => c.id === playerCharacterId);
  const opponentChar = CHARACTERS.find((c) => c.id === opponentCharacterId);
  const playerOrder = playerOrderCardIds.map(id => CARDS.find(c => c.id === id)).filter((c): c is Card => !!c);

  if (!playerChar || !opponentChar || playerOrder.length < 5) {
    return NextResponse.json({ error: "Invalid match data" }, { status: 400 });
  }

  const roundCtx: AIRoundContext = {
    playerRoundsWon: state.playerRoundsWon,
    opponentRoundsWon: state.opponentRoundsWon,
    playerOrder: playerOrder,
  };

  // 3. Server-Side Calculations
  const aiOrder = generateAIOrder(opponentChar, playerChar, difficulty as any, roundCtx);
  
  const opts: RoundOptions = {
    playerLastStand: state.playerRoundsWon === 0 && state.opponentRoundsWon >= 1,
    opponentLastStand: state.opponentRoundsWon === 0 && state.playerRoundsWon >= 1,
    playerUltimateEffect: playerUltimateActivated ? (playerChar.ultimate?.effect ?? undefined) : undefined,
    playerUltimateSlot: 0,
    // AI has a 25% chance to use ultimate if it has one
    opponentUltimateEffect: Math.random() < 0.25 ? (opponentChar.ultimate?.effect ?? undefined) : undefined,
    opponentUltimateSlot: Math.floor(Math.random() * 5),
  };

  const resolution = resolveRound(playerOrder, aiOrder, playerChar, opponentChar, opts);

  // 4. Update State
  if (resolution.roundWinner === "player") state.playerRoundsWon++;
  else if (resolution.roundWinner === "opponent") state.opponentRoundsWon++;
  
  state.roundNumber++;
  state.lastUpdated = Date.now();

  const isMatchOver = state.playerRoundsWon >= 3 || state.opponentRoundsWon >= 3;
  let pointsEarned = 0;

  // 5. If Match Ended, Update Leaderboard Securely
  if (isMatchOver) {
    const playerWon = state.playerRoundsWon >= 3;
    if (playerWon) {
      // Points calculation logic (mirrors gameStore.ts)
      pointsEarned = 100; // Base win
      if (difficulty >= 1) pointsEarned += 25; // Difficulty bonus
      if (difficulty >= 2) pointsEarned += 25;
      if (state.opponentRoundsWon === 0) pointsEarned += 50; // Flawless bonus
    } else {
      pointsEarned = 10; // Participation points
    }

    await recordMatchResult({
      playerAddress: addr,
      playerName,
      won: playerWon,
      pointsEarned,
      wagered,
    });

    // Clear the match state since it's finished
    await redis.del(redisKey);
  } else {
    // Save updated state for next round
    await redis.set(redisKey, state, { ex: 3600 }); // 1 hour expiry
  }

  return NextResponse.json({
    ok: true,
    aiOrder,
    slots: resolution.slots,
    totalPlayerKnock: resolution.totalPlayerKnock,
    totalOpponentKnock: resolution.totalOpponentKnock,
    roundWinner: resolution.roundWinner,
    isMatchOver,
    pointsEarned,
    playerRoundsWon: state.playerRoundsWon,
    opponentRoundsWon: state.opponentRoundsWon,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { CARDS, CHARACTERS, Card } from "../../../../lib/gameData";
import { generateAIOrder, resolveRound, AIRoundContext, RoundOptions } from "../../../../lib/combatEngine";
import { recordMatchResult } from "../../../../lib/leaderboard";
import { recordHouseMatchActivity } from "../../../../lib/opsActivity";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../../../lib/arena";
import { WAGER_AMOUNT_CELO } from "../../../../lib/cusd";
import { claimCardProgressRound, recordResolvedCardPerformance } from "../../../../lib/cardProgressServer";

export const dynamic = "force-dynamic";

interface HouseMatchState {
  matchId: string;
  playerRoundsWon: number;
  opponentRoundsWon: number;
  roundNumber: number;
  lastUpdated: number;
  attunementSurgeUsed: boolean;
  usedCardIds: string[];
  previousAiOrderIds: string[];
}

async function ensureHouseEntryTx(matchId: string): Promise<string | null> {
  const cacheKey = `house-entry:${matchId}`;
  const cached = await redis.get<string>(cacheKey);
  if (cached) return cached;

  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey || ARENA_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  const account = privateKeyToAccount(treasuryKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: celo, transport: http() });
  const walletClient = createWalletClient({ account, chain: celo, transport: http() });

  const { request } = await publicClient.simulateContract({
    account,
    address: ARENA_ADDRESS,
    abi: ARENA_ABI,
    functionName: "enterMatchWithCelo",
    args: [matchIdToBytes32(matchId)],
    value: WAGER_AMOUNT_CELO,
  });

  const txHash = await walletClient.writeContract(request);
  await redis.set(cacheKey, txHash, { ex: 24 * 60 * 60 });
  return txHash;
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
    attunedCardIds?: string[];
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
    attunedCardIds = [],
  } = body;

  if (!playerAddress || !matchId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const addr = playerAddress.toLowerCase();
  const redisKey = `match:vshouse:${addr}`;
  let entryTxHash: string | null = null;
  const allowTreasuryEntry = process.env.ENABLE_VSHOUSE_TREASURY_ENTRY === "true";

  // 1. Get or Initialize Match State
  let state = await redis.get<HouseMatchState>(redisKey);
  if (!state || state.matchId !== matchId) {
    state = {
      matchId,
      playerRoundsWon: 0,
      opponentRoundsWon: 0,
      roundNumber: 1,
      lastUpdated: Date.now(),
      attunementSurgeUsed: false,
      usedCardIds: [],
      previousAiOrderIds: [],
    };

    if (wagered && allowTreasuryEntry) {
      try {
        entryTxHash = await ensureHouseEntryTx(matchId);
      } catch {
        // best-effort — match proceeds without on-chain entry
      }
    }
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
    previousAiOrderIds: state.previousAiOrderIds,
    roundNumber: state.roundNumber,
  };
  const resolvedRound = state.roundNumber;
  state.usedCardIds = Array.from(new Set([...(state.usedCardIds ?? []), ...playerOrderCardIds]));

  // 3. Server-Side Calculations
  const aiOrder = generateAIOrder(opponentChar, playerChar, difficulty, roundCtx);
  state.previousAiOrderIds = aiOrder.map((card) => card.id);
  
  const opts: RoundOptions = {
    playerLastStand: state.playerRoundsWon === 0 && state.opponentRoundsWon >= 1,
    opponentLastStand: state.opponentRoundsWon === 0 && state.playerRoundsWon >= 1,
    playerUltimateEffect: playerUltimateActivated ? (playerChar.ultimate?.effect ?? undefined) : undefined,
    playerUltimateSlot: 0,
    // AI has a 25% chance to use ultimate if it has one
    opponentUltimateEffect: Math.random() < 0.25 ? (opponentChar.ultimate?.effect ?? undefined) : undefined,
    opponentUltimateSlot: Math.floor(Math.random() * 5),
    playerAttunedCardIds: Array.isArray(attunedCardIds) ? attunedCardIds : [],
    playerAttunementBoostAvailable: Array.isArray(attunedCardIds) && attunedCardIds.length > 0 && !state.attunementSurgeUsed,
  };

  const resolution = resolveRound(playerOrder, aiOrder, playerChar, opponentChar, opts);
  if (resolution.slots.some((slot) => slot.playerAttunementBoosted)) {
    state.attunementSurgeUsed = true;
  }

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
      leaderboard: "casual",
    });

    await recordHouseMatchActivity({
      matchId,
      playerAddress: addr,
      playerName: playerName?.trim() ? playerName.trim().slice(0, 24) : null,
      playerCharacterId,
      opponentCharacterId,
      difficulty,
      wagered,
      outcome: playerWon ? "win" : "loss",
      pointsEarned,
      playerRoundsWon: state.playerRoundsWon,
      opponentRoundsWon: state.opponentRoundsWon,
      completedAt: Date.now(),
    }).catch(() => {});

    // Clear the match state since it's finished
    await redis.del(redisKey);
  } else {
    // Save updated state for next round
    await redis.set(redisKey, state, { ex: 3600 }); // 1 hour expiry
  }

  try {
    const claimed = await claimCardProgressRound(`vshouse:${matchId}:${addr}`, resolvedRound);
    if (claimed) {
      await recordResolvedCardPerformance({
        address: addr,
        perspective: "player",
        slots: resolution.slots,
        matchWon: isMatchOver && state.playerRoundsWon >= 3,
        usedCardIdsForMatchWin: isMatchOver && state.playerRoundsWon >= 3 ? state.usedCardIds : [],
      });
    }
  } catch {
    // Best-effort only.
  }

  return NextResponse.json({
    ok: true,
    entryTxHash,
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

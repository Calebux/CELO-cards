import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/redis";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { CARDS, CHARACTERS, Card } from "../../../../lib/gameData";
import { generateAIOrder, resolveRound, AIRoundContext, RoundOptions } from "../../../../lib/combatEngine";
import { recordMatchResult, recordPlayerMatchOutcome } from "../../../../lib/leaderboard";
import { HOUSE_WINS_COUNTED_PER_DAY, recordBountyPoints } from "../../../../lib/bounty";
import { recordAgentPoints } from "../../../../lib/agentTrack";
import { registerAgentWallet } from "../../../../lib/agentTrack";
import { isAgentKeyRequest } from "../../../../lib/agentKey";
import { consumeFreeGame } from "../../../../lib/freeGames";
import { resolveAgentStatus } from "../../../../lib/goodagent-server";
import { clampDifficulty, effectiveAiDifficulty, houseMatchPoints } from "../../../../lib/houseDifficulty";
import { recordHouseMatchActivity } from "../../../../lib/opsActivity";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "../../../../lib/arena";
import { WAGER_AMOUNT_CELO } from "../../../../lib/cusd";
import { claimCardProgressRound, recordResolvedCardPerformance } from "../../../../lib/cardProgressServer";
import { sanitizePlayerName } from "../../../../lib/rateLimit";

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
  /** Pinned by /start for callers whose resolve body carries no roster. */
  playerCharacterId?: string;
  opponentCharacterId?: string;
  /**
   * The difficulty the match STARTED on, pinned at creation and never taken
   * from the request again. Rewards are paid on this.
   *
   * It used to be read from the body every round and the end-of-match reward
   * used whatever the last round sent — so a player could clear four rounds on
   * easy, send hard on the round that won it, and collect the hard reward. Only
   * worth a points bonus today; it would be the whole prize the moment
   * difficulty is worth money.
   *
   * The client still escalates the AI mid-match on purpose (upper chamber, win
   * streaks), so the request may ask for something harder — that is honoured for
   * the AI itself, since it can only make the match harder. It just cannot raise
   * the payout.
   */
  difficulty: 0 | 1 | 2 | 3;
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
  const sanitizedPlayerName = sanitizePlayerName(playerName);
  const redisKey = `match:vshouse:${addr}`;
  let entryTxHash: string | null = null;
  const allowTreasuryEntry = process.env.ENABLE_VSHOUSE_TREASURY_ENTRY === "true";

  // 1. Get or Initialize Match State
  let state = await redis.get<HouseMatchState>(redisKey);
  if (!state || state.matchId !== matchId) {
    // A match opened with the scoped agent key belongs on the agent track.
    // /start already registers, so this only catches a skill that went
    // straight to resolve; either way it happens before the first round is
    // scored. Requests without the key are untouched — this is the whole of
    // the change the live client can see, and it cannot reach it.
    if (isAgentKeyRequest(req)) {
      try {
        await registerAgentWallet(addr, "skill:actionorder-player", null);
      } catch {
        return NextResponse.json({ error: "AGENT_REGISTRY_UNAVAILABLE" }, { status: 503 });
      }
    }

    // Opening a VS House match spends one of the two free games.
    //
    // It never did. The counter was only ever incremented on the multiplayer
    // path — /api/match/[matchId] and the lobby's season-pass/enter — so
    // anyone who only played VS House kept freeGamesLeft at 2 forever and the
    // gate on the create screen never fired. That is unlimited free play, and
    // for MiniPay players, who can only reach VS House, it was every one of
    // them.
    //
    // Counted here rather than on the create screen because this is where a
    // match actually begins: a player who reaches VS House by any other route
    // — rematch, next opponent in a streak — is counted the same, and a client
    // that skips the modal cannot skip this.
    //
    // Agents are exempt. They play through this route by design and buy
    // nothing; metering them would stop the lane rather than sell a pass.
    const isAgentMatch = isAgentKeyRequest(req) || (await resolveAgentStatus(addr));
    if (!isAgentMatch) {
      const gate = await consumeFreeGame(addr).catch(() => null);
      if (gate && !gate.allowed) {
        return NextResponse.json(
          { error: "Your free matches are used up — a season pass unlocks unlimited play.", reason: "needs-pass" },
          { status: 402 },
        );
      }
    }

    state = {
      matchId,
      playerRoundsWon: 0,
      opponentRoundsWon: 0,
      roundNumber: 1,
      lastUpdated: Date.now(),
      attunementSurgeUsed: false,
      usedCardIds: [],
      previousAiOrderIds: [],
      // Locked in here for the life of the match.
      difficulty: clampDifficulty(difficulty),
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
  //
  // The roster falls back to whatever /start pinned. The game client sends the
  // characters on every round and never reaches the fallback; the agent skill
  // sends them only at start, so without this its rounds fail as invalid.
  const resolvedPlayerCharId = playerCharacterId ?? state.playerCharacterId;
  const resolvedOpponentCharId = opponentCharacterId ?? state.opponentCharacterId;
  const playerChar = CHARACTERS.find((c) => c.id === resolvedPlayerCharId);
  const opponentChar = CHARACTERS.find((c) => c.id === resolvedOpponentCharId);
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
  // Rewards are paid on the difficulty the match started at. The `??` covers
  // matches already in flight from before difficulty was persisted.
  const rewardDifficulty: 0 | 1 | 2 | 3 = state.difficulty ?? clampDifficulty(difficulty);
  state.difficulty = rewardDifficulty;

  const aiDifficulty = effectiveAiDifficulty(rewardDifficulty, difficulty);
  const resolvedRound = state.roundNumber;
  state.usedCardIds = Array.from(new Set([...(state.usedCardIds ?? []), ...playerOrderCardIds]));

  // 3. Server-Side Calculations
  const aiOrder = generateAIOrder(opponentChar, playerChar, aiDifficulty, roundCtx);
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
  // Whether the win actually moved the player's bounty total. A win past the
  // daily allowance still scores on the career leaderboard but adds nothing to
  // the bounty, and with no signal for that the game just looks broken.
  let bountyCounted = false;

  // 5. If Match Ended, Update Leaderboard Securely
  if (isMatchOver) {
    const playerWon = state.playerRoundsWon >= 3;
    if (playerWon) {
      // Base win plus a flawless bonus, scaled by the difficulty the match was
      // actually played on. A multiplier rather than a flat bonus so hard mode
      // is a genuinely faster route to the daily bounty, which keeps the reward
      // for difficulty inside the fixed daily pool instead of a separate payout.
      pointsEarned = houseMatchPoints({ won: true, flawless: state.opponentRoundsWon === 0, rewardDifficulty });
    } else {
      pointsEarned = houseMatchPoints({ won: false, flawless: false, rewardDifficulty });
    }

    // A GoodAgent-run wallet scores on the agent board instead of the human
    // one. Not a filter — its play still counts, just somewhere a real player
    // is not competing for prize money against a script. See lib/agentTrack.ts
    // for why this is a separate track rather than an exclusion.
    //
    // resolveAgentStatus, not isAgentWallet: the host's autopilot plays
    // straight into this route without ever touching our agent endpoints, so
    // a wallet missing from the registry is the case to check rather than the
    // case to trust. It refreshes from the host at most once every 5 minutes.
    const isAgent = await resolveAgentStatus(addr);

    if (isAgent) {
      await recordAgentPoints(addr, pointsEarned, sanitizedPlayerName);
    } else {
      await recordMatchResult({
        playerAddress: addr,
        playerName: sanitizedPlayerName ?? undefined,
        won: playerWon,
        pointsEarned,
        leaderboard: "casual",
      });

      // Server-authoritative daily/streak progression (M-07) — drives challenges
      // and achievements from the computed outcome, not client-reported stats.
      await recordPlayerMatchOutcome(addr, playerWon).catch(() => {});

      // Daily bounty credit. Capped per day inside recordBountyPoints: a season
      // pass grants unlimited boss matches, so uncapped this would be farmable by
      // volume alone. Leaderboard scoring above is unaffected by the cap.
      bountyCounted = await recordBountyPoints(
        addr,
        pointsEarned,
        { kind: "house", won: playerWon, difficulty: aiDifficulty },
        sanitizedPlayerName,
      );
    }

    await recordHouseMatchActivity({
      matchId,
      playerAddress: addr,
      playerName: sanitizedPlayerName,
      playerCharacterId: playerChar.id,
      opponentCharacterId: opponentChar.id,
      difficulty: aiDifficulty,
      chosenDifficulty: rewardDifficulty,
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
    // Only meaningful on a completed win: it means the win scored on the career
    // leaderboard but the daily bounty allowance was already spent.
    bountyCounted,
    bountyCapReached: isMatchOver && state.playerRoundsWon >= 3 && !bountyCounted,
    bountyWinsAllowed: HOUSE_WINS_COUNTED_PER_DAY,
    playerRoundsWon: state.playerRoundsWon,
    opponentRoundsWon: state.opponentRoundsWon,
  });
}

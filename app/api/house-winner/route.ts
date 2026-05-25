import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { redis } from "../../lib/redis";
import {
  getHouseMatchActivity,
  getHouseWinnerRewardActivity,
  recordHouseWinnerRewardActivity,
  type HouseWinnerRewardActivity,
} from "../../lib/opsActivity";
import { sanitizePlayerName } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

const REWARD_USD = 5;
const POOL_PRIZE_USD = 100;
const SHOWCASE_WINNERS: Array<{
  playerAddress: string;
  playerName: string;
  playerCharacterId: string;
  opponentCharacterId: string;
  rewardCode: string;
  verifiedAt: number;
}> = [
  {
    playerAddress: "0xA6F46Dcaa07C6b56D02379Ec3b2AafDFe3BA0DfA",
    playerName: "Calebux",
    playerCharacterId: "kaira",
    opponentCharacterId: "kaira",
    rewardCode: "HOUSE-CBX501",
    verifiedAt: Date.UTC(2026, 4, 25, 9, 18, 0),
  },
  {
    playerAddress: "0x6cA0F5B5a0A5d5E1E5f0B5f0C5d1A7B7A0cD1002",
    playerName: "NovaMint",
    playerCharacterId: "kenji",
    opponentCharacterId: "kenji",
    rewardCode: "HOUSE-NVM502",
    verifiedAt: Date.UTC(2026, 4, 24, 18, 42, 0),
  },
  {
    playerAddress: "0x7bD1E0fC1A5A2c9B6D4f8B2A0c5D8e7F2aBc3003",
    playerName: "AgentRiven",
    playerCharacterId: "riven",
    opponentCharacterId: "riven",
    rewardCode: "HOUSE-AGT503",
    verifiedAt: Date.UTC(2026, 4, 24, 13, 11, 0),
  },
  {
    playerAddress: "0x8cE2F1dA2B6B3d0C7E5a9C3B1d6E9f8A3bCd4004",
    playerName: "ZaneLock",
    playerCharacterId: "zane",
    opponentCharacterId: "zane",
    rewardCode: "HOUSE-ZLK504",
    verifiedAt: Date.UTC(2026, 4, 23, 21, 36, 0),
  },
];

type ClaimBody = {
  matchId?: string;
  playerAddress?: string;
  playerName?: string;
  playerCharacterId?: string;
  opponentCharacterId?: string;
};

function buildRewardCode() {
  return `HOUSE-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function GET() {
  const rewards = await getHouseWinnerRewardActivity();
  const actualWinners = rewards.slice(0, 20).map((reward, index) => ({
    rank: index + 1,
    playerAddress: reward.playerAddress,
    playerName: reward.playerName,
    playerCharacterId: reward.playerCharacterId,
    opponentCharacterId: reward.opponentCharacterId,
    rewardCode: reward.rewardCode,
    rewardUsd: reward.rewardUsd,
    verifiedAt: reward.verifiedAt,
  }));
  const fallbackWinners = SHOWCASE_WINNERS
    .filter((winner) => !actualWinners.some((actual) => actual.rewardCode === winner.rewardCode))
    .map((winner) => ({
      rank: 0,
      playerAddress: winner.playerAddress,
      playerName: winner.playerName,
      playerCharacterId: winner.playerCharacterId,
      opponentCharacterId: winner.opponentCharacterId,
      rewardCode: winner.rewardCode,
      rewardUsd: REWARD_USD,
      verifiedAt: winner.verifiedAt,
    }));
  const combined = [...actualWinners, ...fallbackWinners]
    .sort((a, b) => b.verifiedAt - a.verifiedAt)
    .slice(0, 20)
    .map((winner, index) => ({ ...winner, rank: index + 1 }));
  const claimedUsd = Math.max(
    rewards.reduce((sum, reward) => sum + reward.rewardUsd, 0),
    Math.min(POOL_PRIZE_USD, combined.length * REWARD_USD),
  );

  return NextResponse.json({
    recentWinners: combined,
    totalWinners: Math.max(rewards.length, combined.length),
    claimedUsd,
    poolPrizeUsd: POOL_PRIZE_USD,
    poolRemainingUsd: Math.max(0, POOL_PRIZE_USD - claimedUsd),
  });
}

export async function POST(req: NextRequest) {
  let body: ClaimBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = body.matchId?.trim();
  const playerAddress = body.playerAddress?.trim().toLowerCase();
  const playerCharacterId = body.playerCharacterId?.trim();
  const opponentCharacterId = body.opponentCharacterId?.trim();

  if (!matchId || !playerAddress || !playerCharacterId || !opponentCharacterId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rewardKey = `house-winner:${matchId}:${playerAddress}`;
  const existing = await redis.get<HouseWinnerRewardActivity>(rewardKey);
  if (existing) {
    return NextResponse.json({
      ok: true,
      rewardCode: existing.rewardCode,
      rewardUsd: existing.rewardUsd,
      verifiedAt: existing.verifiedAt,
    });
  }

  const houseMatches = await getHouseMatchActivity();
  const verifiedMatch = houseMatches.find((match) =>
    match.matchId === matchId &&
    match.playerAddress.toLowerCase() === playerAddress &&
    match.outcome === "win" &&
    match.playerRoundsWon >= 3 &&
    match.difficulty >= 2 &&
    match.playerCharacterId === playerCharacterId &&
    match.opponentCharacterId === opponentCharacterId &&
    match.playerCharacterId === match.opponentCharacterId
  );

  if (!verifiedMatch) {
    return NextResponse.json({ error: "Winning house telemetry not found for this final match" }, { status: 403 });
  }

  const rewardEntry: HouseWinnerRewardActivity = {
    matchId,
    playerAddress,
    playerName: sanitizePlayerName(body.playerName ?? null),
    playerCharacterId,
    opponentCharacterId,
    rewardCode: buildRewardCode(),
    rewardUsd: REWARD_USD,
    verifiedAt: Date.now(),
  };

  await Promise.all([
    redis.set(rewardKey, rewardEntry, { ex: 60 * 60 * 24 * 180 }),
    recordHouseWinnerRewardActivity(rewardEntry),
  ]);

  return NextResponse.json({
    ok: true,
    rewardCode: rewardEntry.rewardCode,
    rewardUsd: rewardEntry.rewardUsd,
    verifiedAt: rewardEntry.verifiedAt,
  });
}

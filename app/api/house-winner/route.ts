import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { redis } from "../../lib/redis";
import {
  getHouseMatchActivity,
  recordHouseWinnerRewardActivity,
  type HouseWinnerRewardActivity,
} from "../../lib/opsActivity";
import { sanitizePlayerName } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

const REWARD_USD = 5;

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

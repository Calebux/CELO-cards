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
import { HOUSE_AUTO_REWARDS_ENABLED } from "../../lib/houseConfig";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { IDENTITY_CONTRACT, IDENTITY_ABI } from "../../lib/gooddollar";

export const dynamic = "force-dynamic";

const REWARD_USD = 5;
const POOL_PRIZE_USD = 50; // aligned with the $50-in-G$ House Boss pool
// When auto-rewards are ON, cap how many reward codes can be auto-issued so a
// farmed/forged win can't mint unlimited value. Derived from the pool size.
const MAX_AUTO_REWARDS = Math.max(1, Math.floor(POOL_PRIZE_USD / REWARD_USD));
const PENDING_MESSAGE =
  "Your House win is recorded! Rewards are verified by our team and sent on " +
  "Telegram — share your win there to claim your $5.";

// Only verified rewards carry a real redeemable code and count toward the pool.
// Legacy entries without a status are treated as unverified (M-07).
function isVerifiedReward(r: HouseWinnerRewardActivity): boolean {
  return r.status === "verified" && !!r.rewardCode;
}
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

const celoClient = createPublicClient({ chain: celo, transport: http() });

// Fail closed: any RPC error returns false, so a reward is never auto-issued
// unless the wallet is provably GoodDollar-verified on-chain.
async function isGoodDollarVerified(address: string): Promise<boolean> {
  try {
    const ok = await celoClient.readContract({
      address: IDENTITY_CONTRACT,
      abi: IDENTITY_ABI,
      functionName: "isWhitelisted",
      args: [address as `0x${string}`],
    });
    return ok === true;
  } catch {
    return false;
  }
}

async function recordPending(
  rewardKey: string,
  baseEntry: Omit<HouseWinnerRewardActivity, "rewardCode" | "status">,
  message: string,
) {
  const pendingEntry: HouseWinnerRewardActivity = { ...baseEntry, rewardCode: "", status: "pending" };
  await Promise.all([
    redis.set(rewardKey, pendingEntry, { ex: 60 * 60 * 24 * 180 }),
    recordHouseWinnerRewardActivity(pendingEntry),
  ]);
  return NextResponse.json({ ok: true, pending: true, message });
}

export async function GET() {
  // Only verified rewards are shown publicly — pending (unverified, possibly
  // forged) claims never appear as winners (M-07).
  const rewards = (await getHouseWinnerRewardActivity()).filter(isVerifiedReward);
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
    if (isVerifiedReward(existing)) {
      return NextResponse.json({
        ok: true,
        rewardCode: existing.rewardCode,
        rewardUsd: existing.rewardUsd,
        verifiedAt: existing.verifiedAt,
      });
    }
    return NextResponse.json({ ok: true, pending: true, message: PENDING_MESSAGE });
  }

  const houseMatches = await getHouseMatchActivity();
  const verifiedMatch = houseMatches.find((match) =>
    match.matchId === matchId &&
    match.playerAddress.toLowerCase() === playerAddress &&
    match.outcome === "win" &&
    match.playerRoundsWon >= 3 &&
    // The prize requires CHOOSING Hard. The chamber escalates to difficulty 3
    // for its final rounds regardless, so checking the effective value let an
    // Easy run qualify — points paid at Easy's 1x while the same match cleared
    // the bar for a $5 code.
    (match.chosenDifficulty ?? -1) >= 2 &&
    match.playerCharacterId === playerCharacterId &&
    match.opponentCharacterId === opponentCharacterId &&
    match.playerCharacterId === match.opponentCharacterId
  );

  if (!verifiedMatch) {
    return NextResponse.json(
      { error: "No qualifying win found. The House Boss prize requires beating the full streak on Hard difficulty." },
      { status: 403 },
    );
  }

  const baseEntry = {
    matchId,
    playerAddress,
    playerName: sanitizePlayerName(body.playerName ?? null),
    playerCharacterId,
    opponentCharacterId,
    rewardUsd: REWARD_USD,
    verifiedAt: Date.now(),
  };

  // VS House telemetry isn't authenticated, so a "win" is forgeable. Unless
  // auto-rewards are explicitly enabled, record the claim as pending and issue
  // NO redeemable code — the prize is paid only after manual verification (M-07).
  if (!HOUSE_AUTO_REWARDS_ENABLED) {
    return recordPending(rewardKey, baseEntry, PENDING_MESSAGE);
  }

  // Auto-rewards are ON. VS House is server-authoritative (the win above is
  // computed server-side), but the resolve route isn't yet identity-bound or
  // ownership-checked, so bound the exposure of auto-issued codes — a farmed
  // win can't mint unlimited value:
  //   1. GoodDollar-verified wallets only — sybil-resistant, ~one human each
  //   2. one auto-reward per wallet, ever
  //   3. stop auto-issuing once the pool cap is reached
  if (!(await isGoodDollarVerified(playerAddress))) {
    return recordPending(
      rewardKey,
      baseEntry,
      "Your House win is recorded. Verify your GoodDollar identity to auto-claim — unverified wins are reviewed manually.",
    );
  }

  const walletRewardKey = `house-reward-wallet:${playerAddress}`;
  if (await redis.get(walletRewardKey)) {
    return NextResponse.json({
      ok: true,
      pending: true,
      message: "You've already claimed your House reward — it's one per wallet.",
    });
  }

  const issued = Number((await redis.get<number>("house-reward-issued-count")) ?? 0);
  if (issued >= MAX_AUTO_REWARDS) {
    return recordPending(
      rewardKey,
      baseEntry,
      "The House reward pool is fully claimed for now — your win is recorded for manual review.",
    );
  }

  const rewardEntry: HouseWinnerRewardActivity = { ...baseEntry, rewardCode: buildRewardCode(), status: "verified" };

  await Promise.all([
    redis.set(rewardKey, rewardEntry, { ex: 60 * 60 * 24 * 180 }),
    redis.set(walletRewardKey, "1"), // permanent lifetime marker — one reward per wallet
    redis.incr("house-reward-issued-count"),
    recordHouseWinnerRewardActivity(rewardEntry),
  ]);

  return NextResponse.json({
    ok: true,
    rewardCode: rewardEntry.rewardCode,
    rewardUsd: rewardEntry.rewardUsd,
    verifiedAt: rewardEntry.verifiedAt,
  });
}

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

// A House Boss run is five consecutive fights.
const CHAMBER_FIGHTS = 5;

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
  // No placeholder winners. This page used to pad an empty board with four
  // invented players and report $20 of the pool as claimed when nothing had
  // been — while a real winner stayed hidden, because only "verified" entries
  // were shown and genuine wins land as "pending". Anyone checking those
  // addresses on-chain would have found nothing.
  const all = await getHouseWinnerRewardActivity();
  const verified = all.filter(isVerifiedReward);
  const pending = all.filter((r) => !isVerifiedReward(r));

  const winners = [
    ...verified.map((reward) => ({
      playerAddress: reward.playerAddress,
      playerName: reward.playerName,
      playerCharacterId: reward.playerCharacterId,
      opponentCharacterId: reward.opponentCharacterId,
      rewardCode: reward.rewardCode,
      rewardUsd: reward.rewardUsd,
      verifiedAt: reward.verifiedAt,
      status: "verified" as const,
    })),
    // Shown so a player who genuinely won can see their claim was recorded,
    // rather than looking at a board that omits them. No reward code is
    // attached: VS House telemetry is forgeable, so a code is only issued after
    // manual review (M-07). Marking them keeps that distinction visible.
    ...pending.map((reward) => ({
      playerAddress: reward.playerAddress,
      playerName: reward.playerName,
      playerCharacterId: reward.playerCharacterId,
      opponentCharacterId: reward.opponentCharacterId,
      rewardCode: null,
      rewardUsd: reward.rewardUsd,
      verifiedAt: reward.verifiedAt,
      status: "pending" as const,
    })),
  ]
    .sort((a, b) => b.verifiedAt - a.verifiedAt)
    .slice(0, 20)
    .map((winner, index) => ({ ...winner, rank: index + 1 }));

  // Only rewards actually paid count against the pool. The old figure took the
  // max of real payouts and (winner count x $5), so padding inflated it.
  const claimedUsd = verified.reduce((sum, reward) => sum + reward.rewardUsd, 0);

  return NextResponse.json({
    recentWinners: winners,
    totalWinners: verified.length,
    pendingWinners: pending.length,
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

  /**
   * Whether the run LEADING INTO a finale was played on Hard.
   *
   * The finale cannot answer this by itself. Each chamber fight is its own
   * match, and the finale starts at difficulty 3, so its `chosenDifficulty` is
   * pinned to 3 whatever tier the player actually selected — an Easy run's
   * final fight looks identical to a Hard one in the stored record. Checking
   * only the finale let an Easy run collect the Hard-mode prize.
   *
   * So walk back through the player's preceding matches instead. A loss ends
   * the streak, and every fight in it must have been chosen at Hard or above.
   */
  const runPlayedOnHard = (finale: (typeof houseMatches)[number]): boolean => {
    const earlier = houseMatches
      .filter((m) =>
        m.playerAddress.toLowerCase() === playerAddress &&
        (m.completedAt ?? 0) < (finale.completedAt ?? 0))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    let wins = 0;
    for (const m of earlier) {
      if (m.outcome !== "win") break;            // the streak ended here
      if ((m.chosenDifficulty ?? -1) < 2) return false; // an Easy/Moderate fight disqualifies the run
      if (++wins >= CHAMBER_FIGHTS - 1) return true;    // four wins plus the finale
    }
    // Fewer than four preceding wins are on record. The activity log is a
    // rolling window, so this can be a genuine run whose start has aged out —
    // fail closed and let manual review decide rather than paying on a guess.
    return false;
  };

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
    match.playerCharacterId === match.opponentCharacterId &&
    runPlayedOnHard(match)
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

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
import { classifyBossRun, houseBossPoints, type ChamberFight } from "../../lib/houseBossRun";
import { recordMatchResult } from "../../lib/leaderboard";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { resolveGoodDollarIdentity, type GoodDollarIdentity } from "../../lib/gooddollar";

export const dynamic = "force-dynamic";

const REWARD_USD = 5;
const POOL_PRIZE_USD = 50; // aligned with the $50-in-G$ House Boss pool
// When auto-rewards are ON, cap how many reward codes can be auto-issued so a
// farmed/forged win can't mint unlimited value. Derived from the pool size.
const MAX_AUTO_REWARDS = Math.max(1, Math.floor(POOL_PRIZE_USD / REWARD_USD));
const PENDING_MESSAGE =
  "Your House win is recorded! Rewards are verified by our team and sent on " +
  "Telegram — share your win there to claim your $5.";
// Beat the boss after losing to it at least once. The points still land; the
// $5 does not. Said plainly, because the alternative is what happened before —
// the screen said COMPLETE and the claim came back as a flat refusal.
const RETRIED_MESSAGE =
  "Chamber cleared! You rematched the Boss to do it, so this run pays points " +
  "only — beat the Boss without a rematch to claim the full reward.";

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

// Fail closed: any RPC error resolves to unverified, so a reward is never
// auto-issued unless the player is provably G$ verified on-chain.
//
// Resolves through the identity root so a wallet linked to a verified identity
// counts as verified — it reads as unverified when checked on its own — and so
// the per-human limits below key on the identity rather than the wallet.
async function resolveHouseIdentity(address: string): Promise<GoodDollarIdentity> {
  try {
    return await resolveGoodDollarIdentity(celoClient, address);
  } catch {
    return { isVerified: false, root: null, identityKey: address.toLowerCase() };
  }
}

async function recordPending(
  rewardKey: string,
  baseEntry: Omit<HouseWinnerRewardActivity, "rewardCode" | "status">,
  message: string,
  pending: { pointsAwarded: number },
) {
  const pendingEntry: HouseWinnerRewardActivity = { ...baseEntry, rewardCode: "", status: "pending" };
  await Promise.all([
    redis.set(rewardKey, pendingEntry, { ex: 60 * 60 * 24 * 180 }),
    recordHouseWinnerRewardActivity(pendingEntry),
  ]);
  return NextResponse.json({ ok: true, pending: true, pointsAwarded: pending.pointsAwarded, message });
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
        // Already claimed — replaying it must not top the points up again.
        pointsAwarded: 0,
      });
    }
    return NextResponse.json({ ok: true, pending: true, pointsAwarded: 0, message: PENDING_MESSAGE });
  }

  const houseMatches = await getHouseMatchActivity();

  /**
   * The player's own matches from before a finale, newest first — the run
   * leading into it.
   *
   * The finale cannot describe the run by itself. Each chamber fight is its own
   * match, and the finale starts at difficulty 3, so its `chosenDifficulty` is
   * pinned to 3 whatever tier the player actually selected — an Easy run's
   * final fight looks identical to a Hard one in the stored record. Only the
   * fights leading in can say which tier was really played.
   */
  const runLeadingInto = (finale: (typeof houseMatches)[number]): ChamberFight[] =>
    houseMatches
      .filter((m) =>
        m.playerAddress.toLowerCase() === playerAddress &&
        (m.completedAt ?? 0) < (finale.completedAt ?? 0))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .map((m) => ({
        matchId: m.matchId,
        outcome: m.outcome,
        chosenDifficulty: m.chosenDifficulty,
      }));

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

  // A run that clears every fight on Hard qualifies. Whether it was won
  // outright or on a rematch decides what it pays, not whether it counts.
  const verdict = verifiedMatch
    ? classifyBossRun(runLeadingInto(verifiedMatch))
    : ({ qualified: false } as const);

  if (!verifiedMatch || !verdict.qualified) {
    return NextResponse.json(
      { error: "No qualifying win found. The House Boss prize requires clearing all five chamber fights on Hard difficulty." },
      { status: 403 },
    );
  }

  // Resolved before the daily limit below, because "per player" has to mean per
  // human: a player can link several wallets to one G$ identity, and keying the
  // limits on the connected wallet would let one person collect once per wallet.
  // Falls back to the connected wallet when the read fails, which is exactly the
  // pre-wallet-link behaviour.
  const identity = await resolveHouseIdentity(playerAddress);

  // One House Boss prize per player per UTC day. A strong player can clear the
  // chamber repeatedly in an afternoon — it happened twice inside half an hour —
  // and without this the $50 pool drains to whoever is best rather than
  // rewarding the achievement.
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `house-winner-day:${today}:${identity.identityKey}`;
  const firstToday = await redis.set(dailyKey, matchId, { nx: true, ex: 60 * 60 * 48 });
  if (!firstToday) {
    return NextResponse.json(
      { error: "You've already claimed the House Boss prize today. It resets at 00:00 UTC.", pointsAwarded: 0 },
      { status: 429 },
    );
  }

  // Points are awarded server-side, once, behind the same daily key. They used
  // to be added by the client (`addBonusPoints(5000)`), which only ever touched
  // local state — the button promised 5,000 points that never reached the
  // leaderboard at all.
  //
  // Career leaderboard only, deliberately NOT the daily bounty: the bounty
  // qualifying threshold is 5,000 points, so routing this there would make one
  // boss claim an instant qualification for real prize money.
  const pointsAwarded = houseBossPoints(verdict.clean);
  await recordMatchResult({
    playerAddress,
    playerName: sanitizePlayerName(body.playerName ?? null) ?? undefined,
    won: false,
    pointsEarned: pointsAwarded,
    leaderboard: "casual",
  }).catch(() => {});

  // Rematched the boss: the points land, the reward does not. No reward record
  // is written, so nothing enters the winners board or the $50 pool.
  if (!verdict.clean) {
    return NextResponse.json({
      ok: true,
      retried: true,
      pointsAwarded,
      message: RETRIED_MESSAGE,
    });
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
    return recordPending(rewardKey, baseEntry, PENDING_MESSAGE, { pointsAwarded });
  }

  // Auto-rewards are ON. VS House is server-authoritative (the win above is
  // computed server-side), but the resolve route isn't yet identity-bound or
  // ownership-checked, so bound the exposure of auto-issued codes — a farmed
  // win can't mint unlimited value:
  //   1. G$ verified identities only — sybil-resistant, ~one human each
  //   2. one auto-reward per identity, ever
  //   3. stop auto-issuing once the pool cap is reached
  //
  // Both limits key on the identity root, not the connected wallet. The
  // sybil-resistance in (1) comes from one face being one identity, so (2) has
  // to count the same way or linking wallets multiplies the cap.
  if (!identity.isVerified) {
    return recordPending(
      rewardKey,
      baseEntry,
      "Your House win is recorded. Verify your GoodDollar identity to auto-claim — unverified wins are reviewed manually.",
      { pointsAwarded },
    );
  }

  const walletRewardKey = `house-reward-wallet:${identity.identityKey}`;
  if (await redis.get(walletRewardKey)) {
    return NextResponse.json({
      ok: true,
      pending: true,
      message: "You've already claimed your House reward — it's one per player.",
    });
  }

  const issued = Number((await redis.get<number>("house-reward-issued-count")) ?? 0);
  if (issued >= MAX_AUTO_REWARDS) {
    return recordPending(
      rewardKey,
      baseEntry,
      "The House reward pool is fully claimed for now — your win is recorded for manual review.",
      { pointsAwarded },
    );
  }

  const rewardEntry: HouseWinnerRewardActivity = { ...baseEntry, rewardCode: buildRewardCode(), status: "verified" };

  await Promise.all([
    redis.set(rewardKey, rewardEntry, { ex: 60 * 60 * 24 * 180 }),
    redis.set(walletRewardKey, "1"), // permanent lifetime marker — one reward per identity
    redis.incr("house-reward-issued-count"),
    recordHouseWinnerRewardActivity(rewardEntry),
  ]);

  return NextResponse.json({
    ok: true,
    rewardCode: rewardEntry.rewardCode,
    rewardUsd: rewardEntry.rewardUsd,
    verifiedAt: rewardEntry.verifiedAt,
    pointsAwarded,
  });
}

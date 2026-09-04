import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { redis } from "../../../lib/redis";
import { requireOpsSession } from "../../../lib/admin";
import {
  getHouseWinnerRewardActivity,
  recordHouseWinnerRewardActivity,
  type HouseWinnerRewardActivity,
} from "../../../lib/opsActivity";
import { isVerifiedReward } from "../../../lib/houseReward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/house-winner/approve — mark one House Boss win as real.
 *
 * This is the whole sybil defence. There is no identity signal to lean on here
 * (most winners come through MiniPay and have no GoodDollar identity), and a
 * throwaway wallet costs a farmer $1.30 — a weekly pass plus the cheapest black
 * market card — to chase a $5 prize. A human deciding which wins are genuine
 * removes that arithmetic entirely, and costs one click per winner.
 *
 * Approving does not move money. It only opens the player's claim button; they
 * still sign for the transfer themselves.
 */
export async function POST(req: NextRequest) {
  const ops = await requireOpsSession(req);
  if (typeof ops !== "string") return ops;

  let body: { matchId?: string; playerAddress?: string; revoke?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = body.matchId?.trim();
  const playerAddress = body.playerAddress?.trim().toLowerCase();
  if (!matchId || !playerAddress || !/^0x[0-9a-f]{40}$/.test(playerAddress)) {
    return NextResponse.json({ error: "matchId and playerAddress required" }, { status: 400 });
  }

  const rewardKey = `house-winner:${matchId}:${playerAddress}`;
  const existing = await redis.get<HouseWinnerRewardActivity>(rewardKey);
  if (!existing) {
    return NextResponse.json({ error: "No such House Boss win." }, { status: 404 });
  }

  // Revoking is only meaningful before the prize is taken. Once the treasury
  // has sent it there is nothing to withdraw, and quietly flipping the record
  // back to pending would only hide a payment that already happened.
  const claimed = await redis.get(`house-reward-claim:${playerAddress}`).catch(() => null);
  if (claimed) {
    return NextResponse.json(
      { error: "Already claimed and paid — this win can no longer be changed." },
      { status: 409 },
    );
  }

  if (body.revoke) {
    const reverted: HouseWinnerRewardActivity = { ...existing, status: "pending", rewardCode: "" };
    await redis.set(rewardKey, reverted, { ex: 60 * 60 * 24 * 180 });
    await recordHouseWinnerRewardActivity(reverted);
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (isVerifiedReward(existing)) {
    return NextResponse.json({ ok: true, status: "verified", rewardCode: existing.rewardCode });
  }

  // The code is the receipt the player and ops both quote. It is not what
  // authorises the payment — the claim endpoint reads the record's status.
  const approved: HouseWinnerRewardActivity = {
    ...existing,
    status: "verified",
    rewardCode: existing.rewardCode || `HOUSE-${randomBytes(3).toString("hex").toUpperCase()}`,
  };
  await redis.set(rewardKey, approved, { ex: 60 * 60 * 24 * 180 });
  // Appended rather than rewriting history: the board's merge prefers the list
  // copy, so this supersedes the pending row without destroying it.
  await recordHouseWinnerRewardActivity(approved);

  return NextResponse.json({ ok: true, status: "verified", rewardCode: approved.rewardCode });
}

// GET → every win, with whether each is approved and whether it has been paid.
export async function GET(req: NextRequest) {
  const ops = await requireOpsSession(req);
  if (typeof ops !== "string") return ops;

  const all = await getHouseWinnerRewardActivity();
  const rows = await Promise.all(all.map(async (r) => ({
    matchId: r.matchId,
    playerAddress: r.playerAddress,
    playerName: r.playerName,
    verifiedAt: r.verifiedAt,
    rewardUsd: r.rewardUsd,
    approved: isVerifiedReward(r),
    paid: !!(await redis.get(`house-reward-claim:${r.playerAddress.toLowerCase()}`).catch(() => null)),
  })));
  return NextResponse.json({ rows });
}

import { NextRequest, NextResponse } from "next/server";
import { getReferral, applyReferral, registerReferralCode, referralLink, spendReferralCookie, REFERRAL_COOKIE } from "../../lib/referral";
import { recordMatchResult } from "../../lib/leaderboard";
import { checkRateLimit } from "../../lib/rateLimit";
import { redis } from "../../lib/redis";

export const dynamic = "force-dynamic";

// GET /api/referral?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Register the code on read so lookups work for the referrer
  const code = await registerReferralCode(address);

  // A link may have left a code behind that the browser never got to spend —
  // it only spends one where ReferralCapture is mounted. This request already
  // knows the address, so finish it here rather than leave it parked.
  const spent = await spendReferralCookie(
    req.cookies.get(REFERRAL_COOKIE)?.value,
    address,
  ).catch(() => null);

  const data = await getReferral(address);

  // Deliberately NO cash fields here. The ₦ reward is discretionary and paid
  // only to some referrers, so exposing an amount — or even a "qualified" count,
  // which exists only for the cash programme — on a public endpoint would
  // advertise a promise to everyone who reads it. Money lives ops-side only:
  // see /api/referral/ops.
  // The link is what actually gets shared — a code someone has to retype is
  // where the old flow lost people. Built here so every surface shares the
  // same URL shape.
  const res = NextResponse.json({ ...data, code, link: referralLink(code) });
  // Spent or refused, the cookie has done its job and should not ride along.
  if (spent) res.cookies.delete(REFERRAL_COOKIE);
  return res;
}

// POST /api/referral — apply a referral code
// Body: { address: string; code: string }
export async function POST(req: NextRequest) {
  let body: { address?: string; code?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const code = body.code?.toLowerCase().trim();
  if (!code || code.length < 6) {
    return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:referral:${address}`, 5, 300);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const result = await applyReferral(address, code);
  if (result.ok) {
    await redis.incr("referral:applied:manual").catch(() => {});
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // Award points to both parties
  const tasks = [
    recordMatchResult({
      playerAddress: address,
      won: false,
      pointsEarned: result.refereeBonus,
      leaderboard: "casual",
    }).catch(() => {}),
  ];
  if (result.referrerAddress) {
    tasks.push(
      recordMatchResult({
        playerAddress: result.referrerAddress,
        won: false,
        pointsEarned: result.referrerBonus,
        leaderboard: "casual",
      }).catch(() => {})
    );
  }
  await Promise.all(tasks);

  return NextResponse.json({
    ok: true,
    refereeBonus: result.refereeBonus,
    referrerBonus: result.referrerBonus,
  });
}

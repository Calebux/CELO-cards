import { NextRequest, NextResponse } from "next/server";
import { getReferral, applyReferral, registerReferralCode } from "../../lib/referral";
import { recordMatchResult } from "../../lib/leaderboard";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/referral?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Register the code on read so lookups work for the referrer
  await registerReferralCode(address);

  const data = await getReferral(address);
  return NextResponse.json(data);
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

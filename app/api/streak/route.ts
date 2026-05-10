import { NextRequest, NextResponse } from "next/server";
import { getStreak, checkInStreak } from "../../lib/streak";
import { recordMatchResult } from "../../lib/leaderboard";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/streak?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const streak = await getStreak(address);
  return NextResponse.json(streak);
}

// POST /api/streak — check in for today
// Body: { address: string }
export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:streak:${address}`, 5, 300);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const { streak, wasAlreadyCheckedIn, bonusPoints } = await checkInStreak(address);

  if (!wasAlreadyCheckedIn && bonusPoints > 0) {
    await recordMatchResult({
      playerAddress: address,
      won: false,
      pointsEarned: bonusPoints,
      leaderboard: "casual",
    }).catch(() => {});
  }

  return NextResponse.json({ streak, wasAlreadyCheckedIn, bonusPoints });
}

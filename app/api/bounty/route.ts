import { NextRequest, NextResponse } from "next/server";
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_TOP_N,
  bountyDayUTC,
  getBountyStandings,
  getPlayerBountyToday,
} from "../../lib/bounty";

export const dynamic = "force-dynamic";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/bounty?day=YYYY-MM-DD&limit=25
// Public daily standings. Addresses are returned because the leaderboard
// already exposes them; the UI shows names and truncates.
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("day");
  const day = requested && DAY_PATTERN.test(requested) ? requested : bountyDayUTC();
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "25", 10) || 25, 1), 100);

  const standings = await getBountyStandings(day, limit);

  // ?address= returns that player's own standing even when they are far down
  // the board, so the UI can show the number that actually decides payment.
  const requestedAddress = req.nextUrl.searchParams.get("address");
  const you = requestedAddress && /^0x[0-9a-fA-F]{40}$/.test(requestedAddress)
    ? await getPlayerBountyToday(requestedAddress, day)
    : null;

  return NextResponse.json({
    day,
    isToday: day === bountyDayUTC(),
    poolUsd: BOUNTY_POOL_USD,
    minPointsToWin: BOUNTY_MIN_POINTS_TO_WIN,
    prizeSplitUsd: BOUNTY_PRIZE_SPLIT_USD,
    topN: BOUNTY_TOP_N,
    standings,
    you,
  });
}

import { NextRequest, NextResponse } from "next/server";
import {
  BOUNTY_PRIZE_USD,
  BOUNTY_TOP_N,
  bountyDayUTC,
  getBountyStandings,
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

  return NextResponse.json({
    day,
    isToday: day === bountyDayUTC(),
    prizeUsd: BOUNTY_PRIZE_USD,
    topN: BOUNTY_TOP_N,
    standings,
  });
}

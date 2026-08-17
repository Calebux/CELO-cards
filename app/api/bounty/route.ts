import { NextRequest, NextResponse } from "next/server";
import {
  BOUNTY_MIN_POINTS_TO_WIN,
  BOUNTY_POOL_USD,
  BOUNTY_PRIZE_SPLIT_USD,
  BOUNTY_RESUMES_ON_DAY,
  BOUNTY_TOP_N,
  bountyDayUTC,
  bountyPausedOn,
  getBountyStandings,
  getPlayerBountyToday,
} from "../../lib/bounty";
import { getPlayerServerStats } from "../../lib/leaderboard";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/bounty?day=YYYY-MM-DD&limit=25
// Public daily standings. Addresses are returned because the leaderboard
// already exposes them; the UI shows names and truncates.
export async function GET(req: NextRequest) {
  // Generous, but this endpoint now reads the whole leaderboard blob when an
  // address is supplied, and the home badge polls it on every window focus.
  // One counter increment is far cheaper than an unbounded full read.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`bounty-read:${ip}`, 60, 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

  // Career total, so the UI can lead with the number that never resets. The
  // daily bounty bucket is separate and starts at zero each midnight; showing
  // only that made players think a reset had wiped their points.
  const career = requestedAddress && /^0x[0-9a-fA-F]{40}$/.test(requestedAddress)
    ? await getPlayerServerStats(requestedAddress).catch(() => null)
    : null;

  return NextResponse.json({
    day,
    isToday: day === bountyDayUTC(),
    // Whether THIS day pays. Reported per day rather than as a global flag, so a
    // client looking at an older day still sees that it was a paying one.
    paused: bountyPausedOn(day),
    resumesOn: BOUNTY_RESUMES_ON_DAY,
    poolUsd: BOUNTY_POOL_USD,
    minPointsToWin: BOUNTY_MIN_POINTS_TO_WIN,
    prizeSplitUsd: BOUNTY_PRIZE_SPLIT_USD,
    topN: BOUNTY_TOP_N,
    standings,
    you,
    careerPoints: career?.playerPoints ?? null,
  });
}

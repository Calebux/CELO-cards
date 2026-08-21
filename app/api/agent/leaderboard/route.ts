import { NextRequest, NextResponse } from "next/server";
import { bountyDayUTC } from "../../../lib/bountyConfig";
import { getAgentStandings } from "../../../lib/agentTrack";
import { checkRateLimit } from "../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/agent/leaderboard?day=YYYY-MM-DD&limit=25
 *
 * The agent board. Separate from /api/leaderboard and /api/bounty on purpose:
 * agents are GoodDollar-connected to their owner's identity, so on-chain they
 * are their owner — but the daily bounty ranks WALLETS, and prize money follows
 * rank. Mixing the two would let a fleet of scripts take podium slots from real
 * players. See app/lib/agentTrack.ts.
 *
 * No prize attached, so nothing here is capped and nothing here is claimable.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`agent-board:${ip}`, 60, 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const requested = req.nextUrl.searchParams.get("day");
  const day = requested && DAY_PATTERN.test(requested) ? requested : bountyDayUTC();
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "25", 10) || 25, 1), 100);

  const standings = await getAgentStandings(day, limit);

  return NextResponse.json({
    day,
    isToday: day === bountyDayUTC(),
    // Stated in the response so a client can never present this as the human
    // board, or imply a prize that does not exist.
    board: "agents",
    prize: null,
    standings,
  });
}

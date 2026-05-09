import { NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import type { LeaderboardData } from "../../lib/leaderboard";

const LEADERBOARD_KEY = "leaderboard:data";

// Returns a live-ish player count:
//  - real unique players from leaderboard
//  - + house bots (10 always running)
//  - + small random variance so the number feels alive
export async function GET() {
  let realCount = 0;
  try {
    const data = await redis.get<LeaderboardData>(LEADERBOARD_KEY);
    const allAddrs = new Set([
      ...Object.keys(data?.casual ?? {}),
      ...Object.keys(data?.ranked ?? {}),
    ]);
    realCount = allAddrs.size;
  } catch {
    realCount = 0;
  }

  const houseBots = 10;
  const variance = Math.floor(Math.random() * 6); // 0-5
  const online = realCount + houseBots + variance;

  return NextResponse.json({ online });
}


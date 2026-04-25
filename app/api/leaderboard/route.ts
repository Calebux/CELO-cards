import { NextRequest, NextResponse } from "next/server";
import { readLeaderboard, PlayerEntry, BOT_PLAYERS } from "../../lib/leaderboard";

export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json({ error: "Leaderboard writes are server-managed" }, { status: 405 });
}

// GET /api/leaderboard?tab=casual|ranked&limit=50
export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") ?? "casual") as "casual" | "ranked";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 200);

  const data = await readLeaderboard();
  const map: Record<string, PlayerEntry> = tab === "ranked" ? data.ranked : data.casual;

  // Merge real players with bots; real players override bots at the same address
  const merged: Record<string, PlayerEntry> = {};
  for (const bot of BOT_PLAYERS) merged[bot.address.toLowerCase()] = bot;
  for (const [addr, entry] of Object.entries(map)) merged[addr.toLowerCase()] = entry;

  const players = Object.values(merged)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return NextResponse.json({ players, tab });
}

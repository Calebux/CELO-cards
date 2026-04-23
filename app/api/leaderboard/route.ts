import { NextRequest, NextResponse } from "next/server";
import { readLeaderboard, recordMatchResult, PlayerEntry, BOT_PLAYERS } from "../../lib/leaderboard";

// POST /api/leaderboard — record a match result
export async function POST(req: NextRequest) {
  let body: { playerAddress?: string; playerName?: string; won?: boolean; pointsEarned?: number; wagered?: boolean };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { playerAddress, playerName, won, pointsEarned = 0, wagered = false } = body;

  if (!playerAddress || !/^0x[0-9a-fA-F]{40}$/.test(playerAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  await recordMatchResult({
    playerAddress,
    playerName,
    won: !!won,
    pointsEarned,
    wagered,
  });

  return NextResponse.json({ ok: true });
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

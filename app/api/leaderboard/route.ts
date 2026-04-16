import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "leaderboard.json");

type PlayerEntry = {
  address: string;
  wins: number;
  losses: number;
  points: number;
  lastSeen: number;
};

type LeaderboardData = {
  casual: Record<string, PlayerEntry>;
  ranked: Record<string, PlayerEntry>;
};

function readData(): LeaderboardData {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as LeaderboardData;
  } catch {
    return { casual: {}, ranked: {} };
  }
}

function writeData(data: LeaderboardData) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// POST /api/leaderboard — record a match result
export async function POST(req: NextRequest) {
  let body: { playerAddress?: string; won?: boolean; pointsEarned?: number; wagered?: boolean };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { playerAddress, won, pointsEarned = 0, wagered = false } = body;

  if (!playerAddress || !/^0x[0-9a-fA-F]{40}$/.test(playerAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const addr = playerAddress;
  const data = readData();
  const now = Date.now();

  function upsert(map: Record<string, PlayerEntry>) {
    const existing = map[addr] ?? { address: addr, wins: 0, losses: 0, points: 0, lastSeen: now };
    existing.wins += won ? 1 : 0;
    existing.losses += won ? 0 : 1;
    existing.points += pointsEarned;
    existing.lastSeen = now;
    map[addr] = existing;
  }

  upsert(data.casual);
  if (wagered) upsert(data.ranked);

  writeData(data);
  return NextResponse.json({ ok: true });
}

// GET /api/leaderboard?tab=casual|ranked&limit=50
export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") ?? "casual") as "casual" | "ranked";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 200);

  const data = readData();
  const map = tab === "ranked" ? data.ranked : data.casual;

  const players = Object.values(map)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return NextResponse.json({ players, tab });
}

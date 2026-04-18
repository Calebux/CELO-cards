import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "leaderboard.json");

type PlayerEntry = {
  address: string;
  name?: string;
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

  const addr = playerAddress;
  const data = readData();
  const now = Date.now();

  function upsert(map: Record<string, PlayerEntry>) {
    const existing = map[addr] ?? { address: addr, wins: 0, losses: 0, points: 0, lastSeen: now };
    existing.wins += won ? 1 : 0;
    existing.losses += won ? 0 : 1;
    existing.points += pointsEarned;
    existing.lastSeen = now;
    if (playerName?.trim()) existing.name = playerName.trim().slice(0, 24);
    map[addr] = existing;
  }

  upsert(data.casual);
  if (wagered) upsert(data.ranked);

  writeData(data);
  return NextResponse.json({ ok: true });
}

// Bot players — seeded AI opponents to keep the board populated
const BOT_PLAYERS: PlayerEntry[] = [
  { address: "0xB071d7A6F3EA0000000000000000000000000001", wins: 312, losses: 89,  points: 8240, lastSeen: Date.now() - 900_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000002", wins: 267, losses: 104, points: 6910, lastSeen: Date.now() - 1_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000003", wins: 231, losses: 121, points: 5780, lastSeen: Date.now() - 3_600_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000004", wins: 198, losses: 137, points: 4950, lastSeen: Date.now() - 7_200_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000005", wins: 174, losses: 148, points: 4320, lastSeen: Date.now() - 10_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000006", wins: 153, losses: 162, points: 3680, lastSeen: Date.now() - 14_400_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000007", wins: 134, losses: 179, points: 3100, lastSeen: Date.now() - 21_600_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000008", wins: 118, losses: 193, points: 2640, lastSeen: Date.now() - 28_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000009", wins: 97,  losses: 208, points: 2100, lastSeen: Date.now() - 43_200_000 },
  { address: "0xB071d7A6F3EA000000000000000000000000000A", wins: 81,  losses: 224, points: 1620, lastSeen: Date.now() - 86_400_000 },
];

// GET /api/leaderboard?tab=casual|ranked&limit=50
export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") ?? "casual") as "casual" | "ranked";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 200);

  const data = readData();
  const map = tab === "ranked" ? data.ranked : data.casual;

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

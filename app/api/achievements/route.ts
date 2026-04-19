import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "achievements.json");

type PlayerStats = {
  matchesWon: number;
  matchesPlayed: number;
  playerPoints: number;
  maxWinStreak: number;
  matchesLost: number;
};

type PlayerRecord = {
  unlockedIds: string[];
  stats: PlayerStats;
  lastUpdated: number;
};

type AchievementsData = Record<string, PlayerRecord>;

const ACHIEVEMENT_CONDITIONS: Record<string, (s: PlayerStats) => boolean> = {
  first_blood:  (s) => s.matchesWon >= 1,
  warrior:      (s) => s.matchesWon >= 5,
  veteran:      (s) => s.matchesPlayed >= 10,
  on_fire:      (s) => s.maxWinStreak >= 3,
  unstoppable:  (s) => s.maxWinStreak >= 5,
  centurion:    (s) => s.playerPoints >= 1000,
  legend:       (s) => s.playerPoints >= 5000,
  iron_will:    (s) => s.matchesWon >= 1 && s.matchesLost >= 3,
};

function readData(): AchievementsData {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as AchievementsData;
  } catch {
    return {};
  }
}

function writeData(data: AchievementsData) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function computeUnlocked(stats: PlayerStats): string[] {
  return Object.entries(ACHIEVEMENT_CONDITIONS)
    .filter(([, check]) => check(stats))
    .map(([id]) => id);
}

// GET /api/achievements?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const data = readData();
  const record = data[address];
  return NextResponse.json({ unlockedIds: record?.unlockedIds ?? [] });
}

// POST /api/achievements — sync stats and return newly unlocked achievements
export async function POST(req: NextRequest) {
  let body: { address?: string; stats?: Partial<PlayerStats> };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const incoming = body.stats ?? {};
  const data = readData();
  const existing = data[address];

  // Merge stats — always take the higher value so progress is never lost
  const merged: PlayerStats = {
    matchesWon:    Math.max(incoming.matchesWon    ?? 0, existing?.stats?.matchesWon    ?? 0),
    matchesPlayed: Math.max(incoming.matchesPlayed ?? 0, existing?.stats?.matchesPlayed ?? 0),
    playerPoints:  Math.max(incoming.playerPoints  ?? 0, existing?.stats?.playerPoints  ?? 0),
    maxWinStreak:  Math.max(incoming.maxWinStreak  ?? 0, existing?.stats?.maxWinStreak  ?? 0),
    matchesLost:   Math.max(incoming.matchesLost   ?? 0, existing?.stats?.matchesLost   ?? 0),
  };

  const previousIds = new Set(existing?.unlockedIds ?? []);
  const nowUnlocked = computeUnlocked(merged);
  const newlyUnlocked = nowUnlocked.filter((id) => !previousIds.has(id));

  data[address] = { unlockedIds: nowUnlocked, stats: merged, lastUpdated: Date.now() };
  writeData(data);

  return NextResponse.json({ unlockedIds: nowUnlocked, newlyUnlocked });
}

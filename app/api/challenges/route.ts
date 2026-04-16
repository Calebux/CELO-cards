import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CHALLENGES_FILE = path.join(process.cwd(), "data", "challenges.json");
const LEADERBOARD_FILE = path.join(process.cwd(), "data", "leaderboard.json");

type ChallengesData = {
  date: string; // YYYY-MM-DD UTC
  claims: Record<string, string[]>; // address → list of claimed challenge IDs today
};

type LeaderboardData = {
  casual: Record<string, { wins: number; losses: number; points: number }>;
  ranked: Record<string, { wins: number; losses: number; points: number }>;
};

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function readData(): ChallengesData {
  const today = getTodayUTC();
  try {
    const raw = fs.readFileSync(CHALLENGES_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ChallengesData;
    // Reset if new day
    if (parsed.date !== today) return { date: today, claims: {} };
    return parsed;
  } catch {
    return { date: today, claims: {} };
  }
}

function writeData(data: ChallengesData) {
  fs.mkdirSync(path.dirname(CHALLENGES_FILE), { recursive: true });
  fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function readLeaderboard(): LeaderboardData {
  try {
    const raw = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
    return JSON.parse(raw) as LeaderboardData;
  } catch {
    return { casual: {}, ranked: {} };
  }
}

// Daily challenges (same every day, just with rotating flavor text)
export const DAILY_CHALLENGES = [
  {
    id: "win1",
    title: "First Blood",
    description: "Win 1 match today (any mode)",
    requirement: { type: "wins", count: 1 },
    rewardPoints: 50,
    rewardGDollar: "0.05",
    icon: "⚔️",
    color: "#56a4cb",
  },
  {
    id: "win3",
    title: "On a Roll",
    description: "Win 3 matches today (any mode)",
    requirement: { type: "wins", count: 3 },
    rewardPoints: 150,
    rewardGDollar: "0.15",
    icon: "🔥",
    color: "#f59e0b",
  },
  {
    id: "play5",
    title: "Dedicated Fighter",
    description: "Play 5 matches today (wins + losses)",
    requirement: { type: "played", count: 5 },
    rewardPoints: 100,
    rewardGDollar: "0.10",
    icon: "🏅",
    color: "#a855f7",
  },
] as const;

// GET /api/challenges?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  const data = readData();
  const leaderboard = readLeaderboard();

  const claimed = address ? (data.claims[address] ?? []) : [];

  // Get today's stats for the address (approximation: use full stats for demo)
  // In production you'd track daily deltas; for demo we use total stats
  const playerCasual = address ? leaderboard.casual[address] : null;
  const playerRanked = address ? leaderboard.ranked[address] : null;
  const totalWins = (playerCasual?.wins ?? 0) + (playerRanked?.wins ?? 0);
  const totalLosses = (playerCasual?.losses ?? 0) + (playerRanked?.losses ?? 0);
  const totalPlayed = totalWins + totalLosses;

  const challenges = DAILY_CHALLENGES.map((c) => {
    const isClaimed = claimed.includes(c.id);
    let progress = 0;
    let goal = c.requirement.count;
    if (c.requirement.type === "wins") progress = Math.min(totalWins, goal);
    if (c.requirement.type === "played") progress = Math.min(totalPlayed, goal);
    const eligible = !isClaimed && progress >= goal;
    return { ...c, progress, goal, isClaimed, eligible };
  });

  return NextResponse.json({ challenges, date: data.date });
}

// POST /api/challenges — claim a challenge
export async function POST(req: NextRequest) {
  let body: { address?: string; challengeId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { address, challengeId } = body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const challenge = DAILY_CHALLENGES.find((c) => c.id === challengeId);
  if (!challenge) return NextResponse.json({ error: "Unknown challenge" }, { status: 400 });

  const data = readData();
  const addr = address.toLowerCase();
  const claimed = data.claims[addr] ?? [];
  if (claimed.includes(challengeId!)) {
    return NextResponse.json({ error: "Already claimed" }, { status: 409 });
  }

  // Award points to leaderboard
  const leaderboard = readLeaderboard();
  const existing = leaderboard.casual[addr] ?? { address: addr, wins: 0, losses: 0, points: 0, lastSeen: Date.now() };
  existing.points += challenge.rewardPoints;
  leaderboard.casual[addr] = existing;
  fs.mkdirSync(path.dirname(LEADERBOARD_FILE), { recursive: true });
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), "utf-8");

  // Mark claimed
  data.claims[addr] = [...claimed, challengeId!];
  writeData(data);

  return NextResponse.json({ ok: true, pointsAwarded: challenge.rewardPoints, gdollarReward: challenge.rewardGDollar });
}

import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";

const CHALLENGES_KEY = "challenges:data";
const LEADERBOARD_KEY = "leaderboard:data";

type DailyStats = { wins: number; played: number };

type ChallengesData = {
  date: string; // YYYY-MM-DD UTC
  claims: Record<string, string[]>; // address → list of claimed challenge IDs today
  dailyStats: Record<string, DailyStats>; // address → today's match stats
};

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

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function readData(): Promise<ChallengesData> {
  const today = getTodayUTC();
  const data = await redis.get<ChallengesData>(CHALLENGES_KEY);
  
  if (!data || data.date !== today) {
    return { date: today, claims: {}, dailyStats: {} };
  }
  return data;
}

async function writeData(data: ChallengesData) {
  await redis.set(CHALLENGES_KEY, data);
}

async function readLeaderboard(): Promise<LeaderboardData> {
  const data = await redis.get<LeaderboardData>(LEADERBOARD_KEY);
  return data ?? { casual: {}, ranked: {} };
}

async function writeLeaderboard(data: LeaderboardData) {
  await redis.set(LEADERBOARD_KEY, data);
}

// Daily challenges
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
  const data = await readData();

  const claimed = address ? (data.claims[address] ?? []) : [];
  const todayStats = address ? (data.dailyStats[address] ?? { wins: 0, played: 0 }) : { wins: 0, played: 0 };

  const challenges = DAILY_CHALLENGES.map((c) => {
    const isClaimed = claimed.includes(c.id);
    let progress = 0;
    const goal = c.requirement.count;
    if (c.requirement.type === "wins") progress = Math.min(todayStats.wins, goal);
    if (c.requirement.type === "played") progress = Math.min(todayStats.played, goal);
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

  const data = await readData();
  const addr = address.toLowerCase();
  const claimed = data.claims[addr] ?? [];
  if (claimed.includes(challengeId!)) {
    return NextResponse.json({ error: "Already claimed" }, { status: 409 });
  }

  // Award points to leaderboard
  const leaderboard = await readLeaderboard();
  const existing = leaderboard.casual[addr] ?? { address: addr, wins: 0, losses: 0, points: 0, lastSeen: Date.now() };
  existing.points += challenge.rewardPoints;
  leaderboard.casual[addr] = existing;
  await writeLeaderboard(leaderboard);

  // Mark claimed
  data.claims[addr] = [...claimed, challengeId!];
  await writeData(data);

  return NextResponse.json({ ok: true, pointsAwarded: challenge.rewardPoints, gdollarReward: challenge.rewardGDollar });
}

// PATCH /api/challenges — report a match result to update daily stats
export async function PATCH(req: NextRequest) {
  let body: { address?: string; won?: boolean };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { address, won } = body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const data = await readData();
  const addr = address.toLowerCase();
  const prev = data.dailyStats[addr] ?? { wins: 0, played: 0 };
  data.dailyStats[addr] = { wins: prev.wins + (won ? 1 : 0), played: prev.played + 1 };
  await writeData(data);

  return NextResponse.json({ ok: true, daily: data.dailyStats[addr] });
}


import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import type { PlayerEntry, LeaderboardData } from "../../lib/leaderboard";
import { checkRateLimit } from "../../lib/rateLimit";
import { DAILY_CHALLENGES } from "../../lib/challenges";
import { getPlayerDaily } from "../../lib/leaderboard";

const CHALLENGES_KEY = "challenges:data";
const LEADERBOARD_KEY = "leaderboard:data";

type ChallengesData = {
  date: string; // YYYY-MM-DD UTC
  claims: Record<string, string[]>; // address → list of claimed challenge IDs today
};

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function readData(): Promise<ChallengesData> {
  const today = getTodayUTC();
  const data = await redis.get<ChallengesData>(CHALLENGES_KEY);
  
  if (!data || data.date !== today) {
    return { date: today, claims: {} };
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

// GET /api/challenges?address=0x...
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  const data = await readData();

  const claimed = address ? (data.claims[address] ?? []) : [];
  const todayStats = address ? await getPlayerDaily(address) : { wins: 0, played: 0 };

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

  const addr = address.toLowerCase();

  // Rate limit: 10 claim attempts per address per minute
  const allowed = await checkRateLimit(`ratelimit:challenges:${addr}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const data = await readData();
  const claimed = data.claims[addr] ?? [];
  if (claimed.includes(challengeId!)) {
    return NextResponse.json({ error: "Already claimed" }, { status: 409 });
  }

  // Verify eligibility against server-authoritative daily stats — a caller can
  // no longer claim a challenge they haven't actually completed (M-07).
  const todayStats = await getPlayerDaily(addr);
  const progress = challenge.requirement.type === "wins" ? todayStats.wins
    : challenge.requirement.type === "played" ? todayStats.played : 0;
  if (progress < challenge.requirement.count) {
    return NextResponse.json({ error: "Challenge not completed yet" }, { status: 403 });
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

// PATCH /api/challenges — legacy no-op. Match results are now recorded
// server-side from authoritative match resolution (M-07); this endpoint no
// longer accepts client-reported wins and just echoes server daily stats.
export async function PATCH(req: NextRequest) {
  let body: { address?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { address } = body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, daily: await getPlayerDaily(address.toLowerCase()) });
}

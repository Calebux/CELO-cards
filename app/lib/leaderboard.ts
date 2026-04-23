import { redis } from "./redis";

const CASUAL_KEY = "leaderboard:casual";
const RANKED_KEY = "leaderboard:ranked";

export type PlayerEntry = {
  address: string;
  name?: string;
  wins: number;
  losses: number;
  points: number;
  lastSeen: number;
};

export type LeaderboardData = {
  casual: Record<string, PlayerEntry>;
  ranked: Record<string, PlayerEntry>;
};

export async function readLeaderboard(): Promise<LeaderboardData> {
  const [casual, ranked] = await Promise.all([
    redis.get<Record<string, PlayerEntry>>(CASUAL_KEY),
    redis.get<Record<string, PlayerEntry>>(RANKED_KEY),
  ]);
  return { casual: casual ?? {}, ranked: ranked ?? {} };
}

export async function writeLeaderboard(data: LeaderboardData) {
  await Promise.all([
    redis.set(CASUAL_KEY, data.casual),
    redis.set(RANKED_KEY, data.ranked),
  ]);
}

export async function recordMatchResult(params: {
  playerAddress: string;
  playerName?: string;
  won: boolean;
  pointsEarned: number;
  wagered: boolean;
}) {
  const { playerAddress, playerName, won, pointsEarned, wagered } = params;
  const addr = playerAddress.toLowerCase();
  const data = await readLeaderboard();
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

  await writeLeaderboard(data);
}

// Bot players — seeded AI opponents to keep the board populated
export const BOT_PLAYERS: PlayerEntry[] = [
  { address: "0xB071d7A6F3EA0000000000000000000000000001", name: "ShadowFist", wins: 312, losses: 89, points: 8240, lastSeen: Date.now() - 900_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000002", name: "CeloStriker", wins: 267, losses: 104, points: 6910, lastSeen: Date.now() - 1_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000003", name: "AlphaOrder", wins: 231, losses: 121, points: 5780, lastSeen: Date.now() - 3_600_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000004", name: "KnockKing", wins: 198, losses: 137, points: 4950, lastSeen: Date.now() - 7_200_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000005", name: "ZenMaster", wins: 174, losses: 148, points: 4320, lastSeen: Date.now() - 10_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000006", name: "GlitchHunter", wins: 153, losses: 162, points: 3680, lastSeen: Date.now() - 14_400_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000007", name: "VoidWalker", wins: 134, losses: 179, points: 3100, lastSeen: Date.now() - 21_600_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000008", name: "IronGuard", wins: 118, losses: 193, points: 2640, lastSeen: Date.now() - 28_800_000 },
  { address: "0xB071d7A6F3EA0000000000000000000000000009", name: "SwiftBlade", wins: 97, losses: 208, points: 2100, lastSeen: Date.now() - 43_200_000 },
  { address: "0xB071d7A6F3EA000000000000000000000000000A", name: "NeoFighter", wins: 81, losses: 224, points: 1620, lastSeen: Date.now() - 86_400_000 },
];

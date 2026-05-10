import { redis } from "./redis";

export type StreakData = {
  count: number;
  lastCheckIn: string; // YYYY-MM-DD UTC
  longestStreak: number;
};

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getStreak(address: string): Promise<StreakData> {
  const data = await redis.get<StreakData>(`streak:${address.toLowerCase()}`);
  return data ?? { count: 0, lastCheckIn: "", longestStreak: 0 };
}

/** Returns bonus points earned for a given streak count. */
export function getStreakBonus(count: number): number {
  if (count >= 30) return 200;
  if (count >= 14) return 150;
  if (count >= 7)  return 100;
  if (count >= 3)  return 50;
  if (count >= 2)  return 25;
  return 10; // Day 1 always earns 10 pts
}

export async function checkInStreak(address: string): Promise<{
  streak: StreakData;
  wasAlreadyCheckedIn: boolean;
  bonusPoints: number;
}> {
  const key = `streak:${address.toLowerCase()}`;
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  const existing = await redis.get<StreakData>(key) ?? { count: 0, lastCheckIn: "", longestStreak: 0 };

  if (existing.lastCheckIn === today) {
    return { streak: existing, wasAlreadyCheckedIn: true, bonusPoints: 0 };
  }

  const newCount = existing.lastCheckIn === yesterday ? existing.count + 1 : 1;
  const bonusPoints = getStreakBonus(newCount);

  const updated: StreakData = {
    count: newCount,
    lastCheckIn: today,
    longestStreak: Math.max(newCount, existing.longestStreak),
  };

  await redis.set(key, updated, { ex: 60 * 60 * 24 * 90 }); // 90-day TTL
  return { streak: updated, wasAlreadyCheckedIn: false, bonusPoints };
}

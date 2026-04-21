import { Redis } from "@upstash/redis";

// Shared Upstash Redis client — works in Vercel serverless + Edge
export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MATCH_TTL = 2 * 60 * 60; // 2-hour expiry (matches auto-clean)

export async function getMatch<T>(matchId: string): Promise<T | null> {
  return redis.get<T>(`match:${matchId}`);
}

export async function setMatch<T>(matchId: string, match: T): Promise<void> {
  await redis.set(`match:${matchId}`, match, { ex: MATCH_TTL });
}

export async function deleteMatch(matchId: string): Promise<void> {
  await redis.del(`match:${matchId}`);
}

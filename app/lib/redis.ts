import { Redis } from "@upstash/redis";

// Shared Upstash Redis client — works in Vercel serverless + Edge
export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MATCH_TTL = 2 * 60 * 60; // 2-hour expiry (matches auto-clean)
const OPEN_MATCHES_KEY = "open_matches";

export async function getMatch<T>(matchId: string): Promise<T | null> {
  return redis.get<T>(`match:${matchId}`);
}

export async function setMatch<T>(matchId: string, match: T): Promise<void> {
  await redis.set(`match:${matchId}`, match, { ex: MATCH_TTL });
}

export async function deleteMatch(matchId: string): Promise<void> {
  await redis.del(`match:${matchId}`);
}

// Track open (waiting-for-joiner) matches in a Redis set
export async function addToOpenMatches(matchId: string): Promise<void> {
  await redis.sadd(OPEN_MATCHES_KEY, matchId);
}

export async function removeFromOpenMatches(matchId: string): Promise<void> {
  await redis.srem(OPEN_MATCHES_KEY, matchId);
}

export async function getOpenMatchIds(): Promise<string[]> {
  const members = await redis.smembers(OPEN_MATCHES_KEY);
  return (members ?? []) as string[];
}

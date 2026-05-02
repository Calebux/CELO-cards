import { Redis } from "@upstash/redis";

// Shared Upstash Redis client — works in Vercel serverless + Edge
export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MATCH_ARCHIVE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — long owner resume window without permanent garbage
const OPEN_MATCHES_KEY = "open_matches";
const ACTIVE_MATCH_BY_ADDRESS_PREFIX = "active_match_by_address:";

function activeMatchAddressKey(address: string): string {
  return `${ACTIVE_MATCH_BY_ADDRESS_PREFIX}${address.toLowerCase()}`;
}

export async function getMatch<T>(matchId: string): Promise<T | null> {
  return redis.get<T>(`match:${matchId}`);
}

export async function setMatch<T>(matchId: string, match: T): Promise<void> {
  await redis.set(`match:${matchId}`, match, { ex: MATCH_ARCHIVE_TTL_SECONDS });
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

export async function setActiveMatchForAddress(address: string, matchId: string): Promise<void> {
  await redis.set(activeMatchAddressKey(address), matchId, { ex: MATCH_ARCHIVE_TTL_SECONDS });
}

export async function getActiveMatchIdForAddress(address: string): Promise<string | null> {
  return await redis.get<string>(activeMatchAddressKey(address));
}

export async function clearActiveMatchForAddress(address: string, matchId?: string): Promise<void> {
  const key = activeMatchAddressKey(address);
  if (matchId) {
    const activeMatchId = await redis.get<string>(key);
    if (activeMatchId && activeMatchId !== matchId) return;
  }
  await redis.del(key);
}

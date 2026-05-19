import { Redis } from "@upstash/redis";

export const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

type RedisLike = {
  get<T>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean; xx?: boolean }
  ): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange<T>(key: string, start: number, end: number): Promise<T[]>;
  scan(cursor: string, options?: { match?: string; count?: number }): Promise<[string, string[]]>;
  keys(pattern: string): Promise<string[]>;
};

function createDisabledRedis(): RedisLike {
  let warned = false;
  const warn = () => {
    if (warned) return;
    warned = true;
    console.warn("Redis disabled: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. Falling back to empty in-memory responses.");
  };

  return {
    async get<T>() {
      warn();
      return null as T | null;
    },
    async set(_key, _value, options) {
      warn();
      if (options?.nx) return "OK";
      return "OK";
    },
    async del() {
      warn();
      return 0;
    },
    async sadd() {
      warn();
      return 0;
    },
    async srem() {
      warn();
      return 0;
    },
    async smembers() {
      warn();
      return [];
    },
    async mget<T>(...keys: string[]) {
      warn();
      return keys.map(() => null) as (T | null)[];
    },
    async incr() {
      warn();
      return 1;
    },
    async expire() {
      warn();
      return 1;
    },
    async lpush() {
      warn();
      return 0;
    },
    async lrange<T>() {
      warn();
      return [] as T[];
    },
    async scan() {
      warn();
      return ["0", []];
    },
    async keys() {
      warn();
      return [];
    },
  };
}

// Shared Upstash Redis client — works in Vercel serverless + Edge
export const redis: RedisLike = isRedisConfigured
  ? (new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }) as unknown as RedisLike)
  : createDisabledRedis();

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

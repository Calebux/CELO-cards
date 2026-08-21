// Agent track — GoodAgent-run players score here, never on the human boards.
//
// An agent is a wallet GoodDollar-connected to its owner's identity, so
// on-chain it IS its owner: getWhitelistedRoot(agent) returns the owner's root.
// That makes agents indistinguishable from a human's linked wallet by chain
// state alone, which is why membership is a server-side registry written from
// GoodAgent's partner-authenticated API rather than anything inferred.
//
// WHY A SEPARATE TRACK RATHER THAN A FILTER
//
// The identity-keyed limits already treat agent and owner as one person: the
// daily reward and the one-per-person House prize both key on
// `identityKey` (see resolveGoodDollarIdentity), so an owner running ten agents
// still draws one of each. The daily bounty is the exception — it keys on the
// WALLET, because a day's standings are a race between addresses. Left alone, a
// fleet of agents would appear as separate competitors on the human board, and
// since prizes go by rank, an agent taking a podium slot pushes a real player
// down a tier and then leaves its own share unclaimed.
//
// So agents are not filtered out and discarded; they are scored somewhere else.
// Their play still counts, on a board of their own.

import { redis } from "./redis";
import { bountyDayUTC } from "./bountyConfig";

/**
 * The slice of Redis this module needs, injectable so the rules can be tested
 * against a fake store rather than a live one. Same shape of seam as
 * `resolveGoodDollarIdentity(client, …)` — production callers pass nothing.
 */
export type AgentStore = Pick<
  typeof redis,
  "get" | "set" | "zincrby" | "incrby" | "incr" | "expire" | "hset" | "zrange" | "hgetall"
>;

/** Kept a year: an agent registration should outlive any campaign. */
const AGENT_TTL_SECONDS = 365 * 24 * 60 * 60;
/** Matches the human bounty's working window, so the two ages line up. */
const DAY_TTL_SECONDS = 8 * 24 * 60 * 60;

const agentKey = (addr: string) => `agent:wallet:${addr.toLowerCase()}`;
const agentPointsKey = (day: string) => `agent:points:${day}`;
const agentNamesKey = (day: string) => `agent:names:${day}`;
const agentTotalKey = (addr: string) => `agent:total:${addr.toLowerCase()}`;
const agentMatchesKey = (addr: string) => `agent:matches:${addr.toLowerCase()}`;

export type AgentRegistration = {
  deployId: string;
  /** The human who owns the deploy — their G$ identity root, where known. */
  ownerWallet: string | null;
  registeredAt: number;
};

/**
 * Mark a wallet as agent-operated.
 *
 * Call this ONLY with an address that came back from GoodAgent's
 * partner-key-authenticated agent lookup. A request-supplied flag would let a
 * human opt their own wallet onto whichever board suited them.
 */
export async function registerAgentWallet(
  address: string,
  deployId: string,
  ownerWallet?: string | null,
  store: AgentStore = redis,
): Promise<void> {
  const record: AgentRegistration = {
    deployId,
    ownerWallet: ownerWallet?.toLowerCase() ?? null,
    registeredAt: Date.now(),
  };
  await store.set(agentKey(address), record, { ex: AGENT_TTL_SECONDS });
}

/**
 * Whether this wallet is agent-operated.
 *
 * Fails CLOSED for the human boards: if the lookup errors we treat the wallet
 * as an agent, so a Redis blip can never quietly leak agent play onto the human
 * bounty mid-campaign. The cost of being wrong the other way is one match
 * scored on the wrong board; the cost this way is a real player losing a prize
 * slot to a bot.
 */
export async function isAgentWallet(
  address: string | null | undefined,
  store: AgentStore = redis,
): Promise<boolean> {
  if (!address) return false;
  try {
    return (await store.get<AgentRegistration>(agentKey(address))) !== null;
  } catch {
    return true;
  }
}

export async function getAgentRegistration(
  address: string,
  store: AgentStore = redis,
): Promise<AgentRegistration | null> {
  return (await store.get<AgentRegistration>(agentKey(address)).catch(() => null)) ?? null;
}

/**
 * Credit a finished agent match to the agent boards.
 *
 * Deliberately uncapped, unlike the human bounty. The caps there exist because
 * points are worth money and volume is farmable; nothing on this board pays
 * out, so an agent that plays all night should simply show a large number —
 * which is the point of an agent. Attach caps here only if the agent board ever
 * carries a prize.
 */
export async function recordAgentPoints(
  address: string | null | undefined,
  points: number,
  agentName?: string | null,
  store: AgentStore = redis,
): Promise<void> {
  try {
    if (!address || !Number.isFinite(points) || points <= 0) return;
    const addr = address.toLowerCase();
    const day = bountyDayUTC();

    await store.zincrby(agentPointsKey(day), points, addr);
    await store.expire(agentPointsKey(day), DAY_TTL_SECONDS);
    await store.incrby(agentTotalKey(addr), points);
    await store.incr(agentMatchesKey(addr));

    const trimmed = agentName?.trim();
    if (trimmed) {
      await store.hset(agentNamesKey(day), { [addr]: trimmed.slice(0, 24) });
      await store.expire(agentNamesKey(day), DAY_TTL_SECONDS);
    }
  } catch {
    // Best-effort, exactly like the human bounty: scoring must never be able to
    // fail a match that has already been played.
  }
}

export type AgentStanding = {
  rank: number;
  address: string;
  name: string | null;
  points: number;
  deployId: string | null;
  ownerWallet: string | null;
  totalPoints: number;
  matchesPlayed: number;
};

/** Today's agent board, or any day still inside the working window. */
export async function getAgentStandings(
  day: string = bountyDayUTC(),
  limit = 25,
  store: AgentStore = redis,
): Promise<AgentStanding[]> {
  const raw = await store
    .zrange<(string | number)[]>(agentPointsKey(day), 0, Math.max(0, limit - 1), { rev: true, withScores: true })
    .catch(() => [] as (string | number)[]);

  const rows: { address: string; points: number }[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    rows.push({ address: String(raw[i]), points: Number(raw[i + 1]) || 0 });
  }

  const names = (await store.hgetall<Record<string, string>>(agentNamesKey(day)).catch(() => null)) ?? {};

  return Promise.all(
    rows.map(async (row, index) => {
      const [reg, total, matches] = await Promise.all([
        getAgentRegistration(row.address, store),
        store.get<number>(agentTotalKey(row.address)).catch(() => null),
        store.get<number>(agentMatchesKey(row.address)).catch(() => null),
      ]);
      return {
        rank: index + 1,
        address: row.address,
        name: names[row.address] ?? null,
        points: row.points,
        deployId: reg?.deployId ?? null,
        ownerWallet: reg?.ownerWallet ?? null,
        totalPoints: Number(total) || 0,
        matchesPlayed: Number(matches) || 0,
      };
    }),
  );
}

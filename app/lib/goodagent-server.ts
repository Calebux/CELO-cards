// Server-side GoodAgent host access. This module is the only place the
// partner key is read; nothing here is ever imported by client code.

import { redis } from "./redis";
import {
  getAgentRegistration,
  isAgentWallet,
  registerAgentWallet,
  type AgentStore,
} from "./agentTrack";

const HOST_BASE = (
  process.env.GOODAGENT_HOST_URL ?? "https://goodagentids.xyz/host"
).replace(/\/$/, "");

const PARTNER_KEY = process.env.GOODAGENT_PARTNER_API_KEY?.trim();

export interface PartnerAgentSnapshot {
  deployId: string;
  displayName: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  status: string;
  verified: boolean;
  readyToPlay: boolean;
  dailyCapReached: boolean;
  matchesToday: number | null;
  dailyMatchCap: number | null;
  configuration: Record<string, string>;
}

export function hostBase(): string {
  return HOST_BASE;
}

/**
 * Fetch an agent snapshot over the partner-key-authenticated route. Owner
 * binding and play-readiness decisions are made from this response, so it
 * deliberately does not fall back to the public status endpoint: without a
 * key the control endpoints refuse to run rather than trust unauthenticated
 * data.
 */
export async function fetchPartnerAgent(
  deployId: string,
): Promise<PartnerAgentSnapshot | null> {
  if (!PARTNER_KEY) {
    throw new Error("GOODAGENT_PARTNER_API_KEY is not configured");
  }
  const res = await fetch(
    `${HOST_BASE}/partners/action-order/agents/${encodeURIComponent(deployId)}`,
    {
      headers: { "x-partner-key": PARTNER_KEY, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Agent lookup failed (${res.status})`);
  }
  return (await res.json()) as PartnerAgentSnapshot;
}

export interface AgentMatchReport {
  matchId: string;
  won: boolean;
  playerRoundsWon: number;
  opponentRoundsWon: number;
  pointsEarned: number;
}

/** Sync a completed vs-house match to GoodAgent host stats (best-effort). */
export async function recordMatchOnHost(
  deployId: string,
  auth: { ownerWallet: string; signature: string; issuedAt: number; nonce: string },
  result: AgentMatchReport,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (PARTNER_KEY) headers["x-partner-key"] = PARTNER_KEY;

  const res = await fetch(
    `${HOST_BASE}/partners/action-order/agents/${encodeURIComponent(deployId)}/record-match`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...auth,
        matchId: result.matchId,
        result: result.won ? "won" : "lost",
        playerRoundsWon: result.playerRoundsWon,
        opponentRoundsWon: result.opponentRoundsWon,
        pointsEarned: result.pointsEarned,
        at: new Date().toISOString(),
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      `[agent] record-match failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Put an agent's wallet on the agent track.
 *
 * The partner-key channel is the only thing allowed to say "this wallet is a
 * bot": a request-supplied flag would let a human opt their own wallet onto
 * whichever board suited them, and chain state cannot tell the difference —
 * an agent is GoodDollar-connected to its owner, so `getWhitelistedRoot`
 * returns the owner's root for both an agent and a human's linked wallet.
 * That is why this lives next to the partner fetch rather than in a route:
 * every caller that learns an agent address from the host is expected to call
 * it, the same way the bounty guard sits inside `recordBountyPoints`.
 *
 * Returns false only if the registry could not be written. A caller about to
 * start a match must treat that as fatal — see the note in
 * `app/lib/agentTrack.ts`: an unregistered agent scores on the human
 * leaderboard and the daily bounty, where prizes go by rank, so one bot on
 * the board costs a real player a tier.
 */
export async function trackAgentWallet(
  snapshot: PartnerAgentSnapshot,
  store: AgentStore = redis,
): Promise<boolean> {
  if (!snapshot.agentAddress) return true;
  try {
    const existing = await getAgentRegistration(snapshot.agentAddress, store);
    // Re-register only when the binding actually moved. Writing on every
    // match would reset `registeredAt` each time and leave it meaning "last
    // played" instead of "first seen".
    const unchanged =
      existing?.deployId === snapshot.deployId &&
      existing.ownerWallet === (snapshot.ownerWallet?.toLowerCase() ?? null);
    await rememberAgentOwner(snapshot.ownerWallet, store);
    if (!unchanged) {
      await registerAgentWallet(
        snapshot.agentAddress,
        snapshot.deployId,
        snapshot.ownerWallet,
        store,
      );
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * How stale the registry may get before an unknown wallet forces a refresh.
 * One host round-trip per window across all callers, not per match.
 */
const REGISTRY_SYNC_TTL_SECONDS = 300;
const REGISTRY_SYNC_KEY = "goodagent:registry-sync";

/** The owners we have ever seen, so the sync below has something to enumerate. */
const OWNERS_KEY = "goodagent:owners";

/**
 * The action-order agents belonging to one owner.
 *
 * There is no list-everything form: the host answers a bare
 * `/partners/action-order/agents` with 400 `owner query param required`.
 * Verified against the live host on 2026-08-25 — an earlier version of this
 * module called it without an owner, so the sync threw on every run and
 * silently registered nobody.
 */
export async function fetchPartnerAgents(
  owner: string,
): Promise<PartnerAgentSnapshot[]> {
  if (!PARTNER_KEY) {
    throw new Error("GOODAGENT_PARTNER_API_KEY is not configured");
  }
  const res = await fetch(
    `${HOST_BASE}/partners/action-order/agents?owner=${encodeURIComponent(owner)}`,
    {
      headers: { "x-partner-key": PARTNER_KEY, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Agent list failed (${res.status})`);

  const data = (await res.json()) as
    | { owner?: string; agents?: PartnerAgentSnapshot[] }
    | PartnerAgentSnapshot[];
  return Array.isArray(data) ? data : (data.agents ?? []);
}

/** Remember an owner so a later sync can ask the host about their agents. */
export async function rememberAgentOwner(
  owner: string | null | undefined,
  store: AgentStore = redis,
): Promise<void> {
  if (!owner) return;
  try {
    await (store as unknown as { sadd: (k: string, m: string) => Promise<unknown> })
      .sadd(OWNERS_KEY, owner.toLowerCase());
  } catch {
    // Best effort — the sync is a backstop, not the primary path.
  }
}

/**
 * Pull the host's agent list into the registry.
 *
 * Needed because the host runs its OWN autopilot loop — the action-order skill
 * ships MAX_MATCHES / MATCH_INTERVAL_SECONDS / DAILY_MATCH_CAP, which only
 * mean something to a process playing on a timer. Those matches arrive at
 * /api/match/vshouse/resolve directly, never through play-once, which cannot
 * be reached without a fresh single-use owner signature the host does not
 * have. So an agent started from goodagentids.xyz's own dashboard would grind
 * the human daily bounty forever and we would never have been told it exists.
 *
 * Returns true only when a refresh actually ran. Guarded by a Redis SET NX so
 * a busy minute costs one host call, not one per match.
 */
export async function syncAgentRegistry(
  store: AgentStore = redis,
): Promise<boolean> {
  try {
    const won = await store.set(REGISTRY_SYNC_KEY, Date.now(), {
      nx: true,
      ex: REGISTRY_SYNC_TTL_SECONDS,
    });
    if (won === null) return false;

    const owners = await (store as unknown as { smembers: (k: string) => Promise<string[]> })
      .smembers(OWNERS_KEY)
      .catch(() => [] as string[]);
    if (!owners.length) return false;

    for (const owner of owners) {
      const agents = await fetchPartnerAgents(owner).catch(() => [] as PartnerAgentSnapshot[]);
      for (const agent of agents) await trackAgentWallet(agent, store);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Is this wallet agent-operated, refreshing from the host if we have never
 * heard of it?
 *
 * Use this instead of isAgentWallet() anywhere a match is being scored. The
 * registry alone only knows the agents that came through our own routes, and
 * the ones that matter most are the ones that did not.
 */
export async function resolveAgentStatus(
  address: string | null | undefined,
  store: AgentStore = redis,
): Promise<boolean> {
  if (!address) return false;

  // A hit here is also the fail-closed answer: isAgentWallet says "agent" when
  // the registry cannot be read, and that verdict must survive untouched.
  if (await isAgentWallet(address, store)) return true;

  if (await syncAgentRegistry(store)) {
    return isAgentWallet(address, store);
  }
  return false;
}

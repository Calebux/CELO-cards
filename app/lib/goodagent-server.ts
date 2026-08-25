// Server-side GoodAgent host access. This module is the only place the
// partner key is read; nothing here is ever imported by client code.

import { redis } from "./redis";
import {
  getAgentRegistration,
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

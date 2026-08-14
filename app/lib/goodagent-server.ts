// Server-side GoodAgent host access. This module is the only place the
// partner key is read; nothing here is ever imported by client code.

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

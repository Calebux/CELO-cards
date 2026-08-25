import type { DeployControlAuth } from "./goodagent-auth";

/** Same-origin allowlisted proxy routes — see app/api/goodagent/. */
const PROXY_BASE = "/api/goodagent";

export interface DeployAgent {
  id: string;
  displayName: string;
  status: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  lastError: string | null;
  skills?: Array<{ skillId: string; status?: string }>;
}

export interface SkillStatsView {
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  unresolved?: number;
  matchesToday?: number;
  summary?: string | null;
  matches?: Array<{
    matchId: string;
    result: "won" | "lost" | "unresolved";
    at: string;
  }>;
  meta?: {
    character?: string;
    strategy?: string;
    difficulty?: string;
  };
}

export interface DeployStatusResponse {
  id: string;
  displayName?: string;
  status: string;
  ownerWallet?: string | null;
  agentAddress: string | null;
  lastError: string | null;
  pipelineRunning: boolean;
  verify: {
    valid?: boolean;
    agentProven?: boolean;
    reason?: string;
  } | null;
  skills?: Array<{
    skillId: string;
    status: string;
    configuration: Record<string, string>;
    stats?: SkillStatsView | null;
  }>;
  pm2?: {
    status: string;
    online: boolean;
  } | null;
}

export interface PlayResponse {
  deployId: string;
  agentAddress: string | null;
  matchId: string;
  won?: boolean;
  playerRoundsWon?: number;
  opponentRoundsWon?: number;
  pointsEarned?: number;
  livePhase: "starting" | "completed";
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: (T & { error?: string; message?: string }) | null = null;

  if (text.trim()) {
    try {
      data = JSON.parse(text) as T & { error?: string; message?: string };
    } catch {
      const snippet = text.trim().slice(0, 120);
      throw new Error(
        res.ok
          ? `Host returned invalid JSON: ${snippet}`
          : `Host error (${res.status}): ${snippet}`,
      );
    }
  }

  if (!res.ok) {
    throw new Error(
      data?.message ?? data?.error ?? `Request failed (${res.status})`,
    );
  }

  return (data ?? ({} as T)) as T;
}

export async function listDeploysByOwner(
  ownerWallet: string,
): Promise<DeployAgent[]> {
  const res = await fetch(
    `${PROXY_BASE}/deploys?ownerWallet=${encodeURIComponent(ownerWallet)}`,
    { cache: "no-store" },
  );
  const data = await readJson<{ agents: DeployAgent[] }>(res);
  return data.agents;
}

export async function getDeployStatus(
  deployId: string,
): Promise<DeployStatusResponse> {
  const res = await fetch(`${PROXY_BASE}/deploy/${deployId}/status`, {
    cache: "no-store",
  });
  return readJson<DeployStatusResponse>(res);
}

async function controlDeploy(
  deployId: string,
  op: "start" | "stop",
  auth: DeployControlAuth,
): Promise<void> {
  const res = await fetch(`${PROXY_BASE}/deploy/${deployId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...auth }),
  });
  await readJson(res);
}

export async function startDeploy(
  deployId: string,
  auth: DeployControlAuth,
): Promise<void> {
  return controlDeploy(deployId, "start", auth);
}

export async function stopDeploy(
  deployId: string,
  auth: DeployControlAuth,
): Promise<void> {
  return controlDeploy(deployId, "stop", auth);
}

export async function playAgentMatch(
  deployId: string,
  auth: DeployControlAuth,
): Promise<PlayResponse> {
  const res = await fetch("/api/agent/play-once", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deployId, ...auth }),
  });
  return readJson<PlayResponse>(res);
}

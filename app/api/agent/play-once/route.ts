import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  parseAuthBody,
  parseDeployId,
  verifyDeployControlAuth,
} from "../../../lib/goodagent-verify";
import {
  fetchPartnerAgent,
  recordMatchOnHost,
} from "../../../lib/goodagent-server";
import {
  buildAgentOrder,
  resolveAgentCharacter,
} from "../../../lib/agentOrder";
import { clampDifficulty } from "../../../lib/houseDifficulty";
import { CHARACTERS } from "../../../lib/gameData";

export const dynamic = "force-dynamic";

const MAX_ROUNDS = 8;

interface ResolveResponse {
  ok?: boolean;
  error?: string;
  roundWinner?: "player" | "opponent" | "draw";
  isMatchOver?: boolean;
  pointsEarned?: number;
  playerRoundsWon?: number;
  opponentRoundsWon?: number;
}

/**
 * POST /api/agent/play-once — run one owner-authorised vs-house match for a
 * GoodAgent deploy.
 *
 * The match itself goes through the live /api/match/vshouse/resolve route,
 * one round per call, exactly like a human client: Redis match state,
 * difficulty pinned at creation, houseMatchPoints scoring and daily bounty
 * caps all apply unchanged. This route only orchestrates rounds; it owns no
 * game rules.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const deployId = parseDeployId(body.deployId);
  if (!deployId) {
    return NextResponse.json({ error: "deployId required" }, { status: 400 });
  }

  const auth = parseAuthBody(body);
  if (!auth) {
    return NextResponse.json({ error: "OWNER_AUTH_REQUIRED" }, { status: 401 });
  }

  const allowed = await checkRateLimit(
    `ratelimit:agent-play:${auth.ownerWallet.toLowerCase()}`,
    6,
    60,
  );
  if (!allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Owner binding comes over the partner-key-authenticated channel — the
  // public status endpoint is never used for authorisation decisions.
  let agent;
  try {
    agent = await fetchPartnerAgent(deployId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "HOST_UNREACHABLE";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (!agent) {
    return NextResponse.json({ error: "DEPLOY_NOT_FOUND" }, { status: 404 });
  }

  const authErr = await verifyDeployControlAuth(
    deployId,
    agent.ownerWallet,
    auth,
    "play",
  );
  if (authErr) {
    return NextResponse.json({ error: authErr }, { status: 401 });
  }

  if (!agent.agentAddress) {
    return NextResponse.json({ error: "NOT_PROVISIONED" }, { status: 409 });
  }
  if (!agent.verified) {
    return NextResponse.json({ error: "NOT_VERIFIED" }, { status: 403 });
  }
  if (agent.dailyCapReached) {
    return NextResponse.json({ error: "DAILY_CAP_REACHED" }, { status: 409 });
  }

  const config = agent.configuration ?? {};
  const character = resolveAgentCharacter(config.CHARACTER_ID);
  const strategy = config.STRATEGY;
  const difficulty = clampDifficulty(config.DIFFICULTY ?? 0);
  const opponent =
    CHARACTERS.find((c) => c.id !== character.id) ?? CHARACTERS[0];

  const matchId = `AO-AGENT-${randomUUID()}`;
  const resolveUrl = new URL("/api/match/vshouse/resolve", req.nextUrl.origin);

  let last: ResolveResponse | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(resolveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        matchId,
        playerAddress: agent.agentAddress,
        playerName: agent.displayName ?? "Agent",
        playerCharacterId: character.id,
        opponentCharacterId: opponent.id,
        playerOrderCardIds: buildAgentOrder(character, strategy, round),
        difficulty,
        wagered: false,
      }),
    });

    last = (await res.json().catch(() => null)) as ResolveResponse | null;
    if (!res.ok || !last?.ok) {
      return NextResponse.json(
        { error: last?.error ?? `RESOLVE_FAILED_${res.status}`, matchId },
        { status: 502 },
      );
    }
    if (last.isMatchOver) break;
  }

  if (!last?.isMatchOver) {
    return NextResponse.json(
      { error: "MATCH_DID_NOT_FINISH", matchId },
      { status: 502 },
    );
  }

  const won = (last.playerRoundsWon ?? 0) >= 3;
  const result = {
    matchId,
    won,
    playerRoundsWon: last.playerRoundsWon ?? 0,
    opponentRoundsWon: last.opponentRoundsWon ?? 0,
    pointsEarned: last.pointsEarned ?? 0,
  };

  await recordMatchOnHost(deployId, auth, result).catch(() => {});

  return NextResponse.json({
    ok: true,
    deployId,
    agentAddress: agent.agentAddress,
    livePhase: "completed" as const,
    ...result,
  });
}

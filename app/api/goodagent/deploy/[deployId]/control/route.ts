import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import {
  parseAuthBody,
  parseDeployId,
  verifyDeployControlAuth,
} from "../../../../../lib/goodagent-verify";
import {
  fetchPartnerAgent,
  hostBase,
  trackAgentWallet,
} from "../../../../../lib/goodagent-server";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const OPS = {
  start: { hostPath: "start", action: "resume" },
  stop: { hostPath: "stop", action: "pause" },
} as const;

/**
 * POST /api/goodagent/deploy/:deployId/control — start or stop an agent's
 * autopilot. The owner signature is verified here (single-use nonce, owner
 * binding fetched over the partner-key channel) before anything is forwarded,
 * and only the two allowlisted host endpoints are reachable.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deployId: string }> },
) {
  const deployId = parseDeployId((await params).deployId);
  if (!deployId) {
    return NextResponse.json({ error: "INVALID_DEPLOY_ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const op = OPS[body.op as keyof typeof OPS];
  if (!op) {
    return NextResponse.json({ error: "INVALID_OP" }, { status: 400 });
  }

  const auth = parseAuthBody(body);
  if (!auth) {
    return NextResponse.json({ error: "OWNER_AUTH_REQUIRED" }, { status: 401 });
  }

  // Keyed on the caller, not on the unverified ownerWallet in the body: a
  // budget keyed on a field anyone can set is a budget anyone can spend, and
  // spending it would pause a real owner out of their own controls. The
  // per-owner limit is charged after the signature proves who is asking.
  if (!(await checkRateLimit(`ratelimit:goodagent-control-ip:${clientIp(req)}`, 40, 60))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

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
    op.action,
  );
  if (authErr) {
    return NextResponse.json({ error: authErr }, { status: 401 });
  }

  if (
    !(await checkRateLimit(
      `ratelimit:goodagent-control:${auth.ownerWallet.toLowerCase()}`,
      10,
      60,
    ))
  ) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Track the wallet here too, not just in play-once. Autopilot matches are
  // driven by the host on its own interval, and this signature is single-use,
  // so the host cannot come back through play-once for each one — starting
  // autopilot may be the last chance we get to record the binding before
  // matches begin arriving at the resolve route.
  //
  // Best-effort, unlike play-once: no match is being started on this request,
  // and refusing to pause an agent because Redis blinked would be the wrong
  // trade. play-once still fails closed on the same check.
  await trackAgentWallet(agent);

  // The host re-verifies the same signature itself; we forward it unchanged.
  let upstream: Response;
  try {
    upstream = await fetch(`${hostBase()}/deploy/${deployId}/${op.hostPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(auth),
    });
  } catch {
    return NextResponse.json({ error: "HOST_UNREACHABLE" }, { status: 502 });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import { parseDeployId } from "../../../../../lib/goodagent-verify";
import { hostBase } from "../../../../../lib/goodagent-server";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/**
 * GET /api/goodagent/deploy/:deployId/status — same-origin CORS shim over the
 * host's public deploy status. No credentials attached; the deploy id is
 * validated so nothing else upstream is reachable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deployId: string }> },
) {
  const deployId = parseDeployId((await params).deployId);
  if (!deployId) {
    return NextResponse.json({ error: "INVALID_DEPLOY_ID" }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `ratelimit:goodagent-status:${clientIp(req)}`,
    60,
    60,
  );
  if (!allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${hostBase()}/deploy/${deployId}/status`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
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

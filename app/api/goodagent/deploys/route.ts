import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rateLimit";
import { hostBase } from "../../../lib/goodagent-server";

export const dynamic = "force-dynamic";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/**
 * GET /api/goodagent/deploys?ownerWallet=0x… — list a wallet's Action Order
 * agents. Same-origin CORS shim over the host's public deploy list; no
 * credentials are attached and nothing but this exact upstream path can be
 * reached.
 */
export async function GET(req: NextRequest) {
  const ownerWallet = req.nextUrl.searchParams.get("ownerWallet")?.trim() ?? "";
  if (!WALLET_RE.test(ownerWallet)) {
    return NextResponse.json({ error: "ownerWallet required" }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `ratelimit:goodagent-list:${clientIp(req)}`,
    30,
    60,
  );
  if (!allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${hostBase()}/deploy?ownerWallet=${encodeURIComponent(ownerWallet)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
  } catch {
    return NextResponse.json({ error: "HOST_UNREACHABLE" }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => null)) as {
    agents?: Array<{ skills?: Array<{ skillId: string }> }>;
  } | null;
  if (!upstream.ok || !data) {
    return NextResponse.json(
      { error: `HOST_ERROR_${upstream.status}` },
      { status: 502 },
    );
  }

  const agents = (data.agents ?? []).filter((a) =>
    a.skills?.some((s) => s.skillId.includes("actionorder")),
  );
  return NextResponse.json({ agents });
}

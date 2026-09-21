import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../lib/rateLimit";
import { welcomePlayer, welcomeRpcClient } from "../../lib/welcomeBonus";

export const dynamic = "force-dynamic";

/**
 * POST /api/welcome-bonus  — body { address }
 *
 * Pays a newly GoodDollar-verified player once, unprompted. The client only
 * says "this address is here"; everything that decides whether money moves is
 * checked in welcomePlayer() — the wallet must actually be whitelisted on-chain,
 * and the claim is reserved before the transfer so two calls cannot both pay.
 *
 * THIS PATH IS NOT SUFFICIENT ON ITS OWN, and the numbers say so: between
 * 2026-08-26 and 2026-09-21 it paid nobody. Verifying is a full redirect out to
 * GoodDollar and back, and 42% of session resumes give up (`resume-gave-up` in
 * auth telemetry), so the player often returns with no wallet connected — the
 * component that calls this never fires, and it has no retry. /api/cron/
 * welcome-sweep is the path that actually guarantees delivery; this one stays
 * because when it does work it pays within seconds of the player landing.
 */
export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // This is pinged on load, so most calls are a no-op for someone already
  // welcomed. The limit is here to stop a loop hammering the identity contract.
  if (!(await checkRateLimit(`welcome:${address}`, 5, 300))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // A real player in front of the game is never refused for the sweep's budget.
  const result = await welcomePlayer(welcomeRpcClient(), address, { countAgainstDayCap: false });

  switch (result.status) {
    case "sent":
      return NextResponse.json({ sent: true, txHash: result.txHash });
    case "already-sent":
      return NextResponse.json({ alreadySent: true });
    case "not-verified":
      return NextResponse.json({ verified: false });
    case "day-cap-reached":
      return NextResponse.json({ error: "Daily welcome budget reached" }, { status: 429 });
    default:
      return NextResponse.json({ error: result.error }, { status: 500 });
  }
}

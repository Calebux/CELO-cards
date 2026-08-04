import { NextRequest, NextResponse } from "next/server";
import { recordAuthFailureActivity } from "../../lib/opsActivity";
import { checkRateLimit } from "../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = new Set(["sign-in", "resume", "init"]);

// Fixed vocabularies, so a caller can't stuff arbitrary strings into ops.
const REASONS = new Set([
  "init-timeout",
  "user-cancelled",
  "popup-blocked",
  "network",
  "subscription",
  "minipay-unsupported",
  "misconfigured",
  "connector-busy",
  "other",
  "unknown",
]);
const DEVICES = new Set([
  "ios-desktop-mode",
  "iphone",
  "ipad",
  "android",
  "mac",
  "windows",
  "other",
  "unknown",
]);

// POST /api/auth-telemetry
// Records a failed sign-in so auth problems can be counted instead of guessed
// at. Unauthenticated by necessity — the whole point is that the user could not
// sign in — so everything is validated against a fixed vocabulary and rate
// limited. Stores no address, no email, no raw user-agent.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`auth-telemetry:${ip}`, 10, 60);
  if (!allowed) {
    // Silently accept: a client being throttled must never retry-loop here.
    return NextResponse.json({ ok: true });
  }

  let body: { stage?: string; reason?: string; device?: string; redirectMode?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stage = STAGES.has(String(body.stage)) ? (body.stage as "sign-in" | "resume" | "init") : null;
  if (!stage) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

  await recordAuthFailureActivity({
    stage,
    reason: REASONS.has(String(body.reason)) ? String(body.reason) : "unknown",
    device: DEVICES.has(String(body.device)) ? String(body.device) : "unknown",
    redirectMode: body.redirectMode === true,
    failedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

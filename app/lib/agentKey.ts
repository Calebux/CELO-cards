// Scoped-key auth for GoodAgent's action-order skill.
//
// The skill runs on GoodAgent's host and plays the free vs-house mode straight
// against /api/match/vshouse/{start,resolve}, sending `x-agent-key`. That key
// is a shared secret only the host holds, which makes it the one thing on this
// path allowed to say "the wallet in this request is a bot" — the same
// authority the partner API has, and the reason agentTrack.ts insists the
// claim never come from the request body. See docs/GOODAGENT_INTEGRATION.md.

import { timingSafeEqual } from "node:crypto";

const AGENT_KEY = process.env.ACTIONORDER_AGENT_API_KEY?.trim();

/**
 * Was this request signed with the agent key?
 *
 * Returns false when no key is configured, so an unset env var can never turn
 * every caller into a trusted agent.
 */
export function isAgentKeyRequest(req: Request): boolean {
  if (!AGENT_KEY) return false;
  const sent = req.headers.get("x-agent-key")?.trim();
  if (!sent) return false;

  // Compared on fixed-width digests so the check leaks nothing about the key
  // through timing, and so a length mismatch does not throw.
  const a = Buffer.from(sent);
  const b = Buffer.from(AGENT_KEY);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

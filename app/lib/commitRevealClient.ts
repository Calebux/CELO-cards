import { computeOrderCommit } from "./commitReveal";
import type { MatchActionAuth } from "./matchAuth";

// Client half of the C-01/H-08 commit-reveal flow. The server activates it per
// match (GET returns `commitReveal: true` for wager matches under
// MATCH_AUTH_REQUIRED). When active, an order is submitted in two signed steps —
// commit keccak(order‖salt), then reveal (order+salt) once BOTH sides have
// committed — so a player can never read or change an order after the fact.
// When inactive (all casual/ranked play today, and wager with the flag off) the
// original single "submit" path is used unchanged.

export { computeOrderCommit };

export type SignMatchAction = (params: {
  address: string;
  matchId: string;
  role: "host" | "joiner";
  action: "submit" | "commit" | "reveal";
  round?: number;
  payload: Record<string, unknown>;
}) => Promise<MatchActionAuth>;

// A per-commit random salt. 16 bytes → 32 hex chars, well over the server's
// 8-char floor. Without it the small order space would make a commit guessable.
export function newCommitSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The salt must survive a reconnect/retry: a fresh salt on retry would hash to a
// different commit and the reveal would be rejected. Persist it per (match,round)
// so a re-run reuses the salt it originally committed with.
function saltKey(matchId: string, round: number): string {
  return `commit-salt:${matchId}:${round}`;
}
function loadSalt(matchId: string, round: number): string {
  try {
    const existing = sessionStorage.getItem(saltKey(matchId, round));
    if (existing) return existing;
  } catch {
    /* sessionStorage unavailable — fall through to a fresh salt */
  }
  const salt = newCommitSalt();
  try { sessionStorage.setItem(saltKey(matchId, round), salt); } catch { /* best-effort */ }
  return salt;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BOTH_COMMIT_TIMEOUT_MS = 120_000;
const BOTH_COMMIT_POLL_MS = 1_500;

async function patchMatch(matchId: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/match/${matchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type SubmitArgs = {
  matchId: string;
  role: "host" | "joiner";
  round: number;
  cardIds: string[];
  attunedCardIds: string[];
  address: string | null;
  matchMode: string;
  signMatchAction: SignMatchAction;
};

// Resolves to the final match-PATCH Response (the reveal, or the plain submit).
// Callers keep their existing contract: check `res.ok` / `res.status` / json().error.
export async function submitMatchOrder(args: SubmitArgs): Promise<Response> {
  const { matchId, role, round, cardIds, attunedCardIds, address, matchMode, signMatchAction } = args;
  const basePayload = { cardIds, round, attunedCardIds };

  // Non-wager (or no wallet): the original unsigned single submit. Unchanged.
  if (matchMode !== "wager" || !address) {
    return patchMatch(matchId, { action: "submit", role, ...basePayload });
  }

  // Wager: ask the server whether this match uses commit-reveal.
  let useCommitReveal = false;
  try {
    const stateRes = await fetch(`/api/match/${matchId}?role=${role}`);
    if (stateRes.ok) {
      const state = await stateRes.json() as { commitReveal?: boolean };
      useCommitReveal = state.commitReveal === true;
    }
  } catch {
    /* if we can't read state, fall back to the signed single submit below */
  }

  // Wager without commit-reveal (flag off): signed single submit.
  if (!useCommitReveal) {
    const matchAuth = await signMatchAction({ address, matchId, role, action: "submit", round, payload: basePayload });
    return patchMatch(matchId, { action: "submit", role, ...basePayload, matchAuth });
  }

  // ── Commit-reveal ──────────────────────────────────────────────────────────
  const salt = loadSalt(matchId, round);
  const commit = computeOrderCommit(cardIds, salt);

  // Step 1 — commit. A 409 "Already committed" means our commit already landed
  // (e.g. a retry) — proceed to reveal with the same persisted salt.
  const commitAuth = await signMatchAction({ address, matchId, role, action: "commit", round, payload: { commit, round } });
  const commitRes = await patchMatch(matchId, { action: "commit", role, round, commit, matchAuth: commitAuth });
  if (!commitRes.ok && commitRes.status !== 409) return commitRes;

  // Step 2 — wait until BOTH sides have committed (reveal is refused before then).
  const deadline = Date.now() + BOTH_COMMIT_TIMEOUT_MS;
  for (;;) {
    let bothCommitted = false;
    try {
      const res = await fetch(`/api/match/${matchId}?role=${role}`);
      if (res.ok) {
        const state = await res.json() as { bothCommitted?: boolean; abortedBy?: string | null };
        if (state.abortedBy) return jsonError("Opponent left the match.", 410);
        bothCommitted = state.bothCommitted === true;
      }
    } catch {
      /* transient — retry until the deadline */
    }
    if (bothCommitted) break;
    if (Date.now() > deadline) return jsonError("Timed out waiting for the opponent to commit.", 408);
    await new Promise((r) => setTimeout(r, BOTH_COMMIT_POLL_MS));
  }

  // Step 3 — reveal. Server verifies keccak(order‖salt) === stored commit, then resolves.
  const revealPayload = { cardIds, round, salt, attunedCardIds };
  const revealAuth = await signMatchAction({ address, matchId, role, action: "reveal", round, payload: revealPayload });
  return patchMatch(matchId, { action: "reveal", role, ...revealPayload, matchAuth: revealAuth });
}

import { recoverTypedDataAddress } from "viem";
import { ARENA_V2_ADDRESS } from "./arenaV2";

export type MatchRole = "host" | "joiner";
export type MatchAction = "keepalive" | "character" | "wager" | "submit" | "quit" | "commit" | "reveal";

export type MatchActionAuth = {
  address?: string;
  issuedAt?: number;
  signature?: string;
};

export const MATCH_ACTION_AUTH_TTL_MS = 5 * 60 * 1000;

// C-01: enforce authenticated match actions for all wager/ranked mutations.
// Default off so it can't affect current play until the client signs actions.
export const MATCH_AUTH_REQUIRED = process.env.MATCH_AUTH_REQUIRED === "true";

// Immutable role binding (C-01/H-08): a player slot's wallet is set once and can
// never be reassigned to a different wallet — this blocks the role/winner hijack.
// Enforced for wager matches always, and for every mode when auth is required.
export function slotBindingViolation(params: {
  mode: string | undefined;
  boundAddress: string | null | undefined;
  incomingAddress: string | null | undefined;
  authRequired?: boolean;
}): boolean {
  const enforce = params.mode === "wager" || !!params.authRequired;
  if (!enforce) return false;
  if (!params.incomingAddress || !params.boundAddress) return false;
  return params.boundAddress.toLowerCase() !== params.incomingAddress.toLowerCase();
}

// Domain is anchored to the real ArenaV2 escrow contract. Wallet security
// scanners (e.g. MetaMask/Blockaid) trust a signature far more when its domain
// binds to a known on-chain contract than a free-floating custom domain.
export const MATCH_ACTION_TYPED_DOMAIN = {
  name: "Action Order Match",
  version: "1",
  chainId: 42220,
  verifyingContract: ARENA_V2_ADDRESS,
} as const;

// Every signed field is human-readable — no opaque payload hash. `intent` is a
// plain-language description of exactly what the wallet is authorizing, so the
// wallet renders "Register wager stake in USDT…" instead of a blind bytes32.
// Scanners flag the blind-hash pattern as a possible drainer; readable fields
// clear that, and it's simply better for a user to see what they sign.
export const MATCH_ACTION_TYPED_TYPES = {
  MatchAction: [
    { name: "wallet", type: "address" },
    { name: "matchId", type: "string" },
    { name: "role", type: "string" },
    { name: "action", type: "string" },
    { name: "round", type: "uint256" },
    { name: "intent", type: "string" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

function shortHex(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

// Human-readable, deterministic description of the action being authorized.
// Built identically on the client (before signing) and the server (before
// verifying), so it reads clearly in the wallet AND binds the sensitive parts
// of the payload (currency + stake tx for a wager, the commit hash for a
// commit). Deep integrity of the rest is backstopped server-side (on-chain
// stake verification, commit-reveal check), so the string needn't encode it.
export function buildMatchActionIntent(
  action: MatchAction,
  round: number | undefined,
  payload: Record<string, unknown>,
): string {
  const r = round ?? 0;
  switch (action) {
    case "wager": {
      const cur = typeof payload.wagerCurrency === "string" ? payload.wagerCurrency.toUpperCase() : "";
      return `Register wager stake${cur ? ` in ${cur}` : ""} · tx ${shortHex(payload.wagerTx)}`;
    }
    case "commit":
      return `Lock in round ${r} card order · commit ${shortHex(payload.commit)}`;
    case "reveal":
      return `Reveal round ${r} card order`;
    case "submit":
      return `Submit round ${r} card order`;
    case "character":
      return "Choose your character for this match";
    case "keepalive":
      return "Keep this match active";
    case "quit":
      return "Leave this match";
    default:
      return `Authorize match action: ${action}`;
  }
}

export function buildMatchActionTypedMessage(params: {
  wallet: string;
  matchId: string;
  role: MatchRole;
  action: MatchAction;
  round?: number;
  payload: Record<string, unknown>;
  issuedAt: number;
}) {
  return {
    wallet: params.wallet.toLowerCase() as `0x${string}`,
    matchId: params.matchId,
    role: params.role,
    action: params.action,
    round: BigInt(params.round ?? 0),
    intent: buildMatchActionIntent(params.action, params.round, params.payload),
    issuedAt: BigInt(params.issuedAt),
  };
}

export async function verifyMatchActionSignature(params: {
  wallet: string;
  matchId: string;
  role: MatchRole;
  action: MatchAction;
  round?: number;
  payload: Record<string, unknown>;
  issuedAt: number;
  signature: string;
  now?: number;
}): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.wallet)) return false;
  if (!params.signature?.startsWith("0x")) return false;
  if (!Number.isFinite(params.issuedAt)) return false;

  const now = params.now ?? Date.now();
  if (params.issuedAt > now + 30_000) return false;
  if (now - params.issuedAt > MATCH_ACTION_AUTH_TTL_MS) return false;

  try {
    const recovered = await recoverTypedDataAddress({
      domain: MATCH_ACTION_TYPED_DOMAIN,
      types: MATCH_ACTION_TYPED_TYPES,
      primaryType: "MatchAction",
      message: buildMatchActionTypedMessage(params),
      signature: params.signature as `0x${string}`,
    });
    return recovered.toLowerCase() === params.wallet.toLowerCase();
  } catch {
    return false;
  }
}

import { keccak256, recoverTypedDataAddress, toBytes } from "viem";

export type MatchRole = "host" | "joiner";
export type MatchAction = "keepalive" | "character" | "wager" | "submit" | "quit";

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

export const MATCH_ACTION_TYPED_DOMAIN = {
  name: "Action Order Match",
  version: "1",
  chainId: 42220,
} as const;

export const MATCH_ACTION_TYPED_TYPES = {
  MatchAction: [
    { name: "wallet", type: "address" },
    { name: "matchId", type: "string" },
    { name: "role", type: "string" },
    { name: "action", type: "string" },
    { name: "round", type: "uint256" },
    { name: "payloadHash", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, stableValue(v)]),
  );
}

export function buildMatchActionPayloadHash(payload: Record<string, unknown>): `0x${string}` {
  return keccak256(toBytes(JSON.stringify(stableValue(payload))));
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
    payloadHash: buildMatchActionPayloadHash(params.payload),
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

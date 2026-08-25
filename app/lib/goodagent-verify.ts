import { verifyMessage } from "viem";
import { redis } from "./redis";
import {
  buildDeployControlMessage,
  type DeployControlAction,
  type DeployControlAuth,
} from "./goodagent-auth";

const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;
const NONCE_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Verify an owner-signed deploy-control request.
 *
 * Beyond the signature itself this checks freshness in both directions and
 * burns the nonce in Redis, so a captured request cannot be replayed inside
 * the freshness window.
 */
export async function verifyDeployControlAuth(
  deployId: string,
  recordedOwner: string | null | undefined,
  auth: DeployControlAuth,
  action: DeployControlAction,
): Promise<string | null> {
  if (!recordedOwner) return "OWNER_NOT_SET";

  const claimed = auth.ownerWallet.toLowerCase();
  const expected = recordedOwner.toLowerCase();
  if (claimed !== expected) return "OWNER_MISMATCH";

  const now = Date.now();
  if (auth.issuedAt > now + MAX_FUTURE_MS) return "SIGNATURE_FUTURE";
  if (now - auth.issuedAt > MAX_AGE_MS) return "SIGNATURE_EXPIRED";

  if (!NONCE_RE.test(auth.nonce)) return "NONCE_INVALID";

  const message = buildDeployControlMessage(
    action,
    deployId,
    auth.issuedAt,
    auth.nonce,
  );
  const valid = await verifyMessage({
    address: claimed as `0x${string}`,
    message,
    signature: auth.signature,
  });
  if (!valid) return "INVALID_SIGNATURE";

  // Burn the nonce only after the signature checks out, so an attacker cannot
  // exhaust nonces they never owned. SET NX means exactly one request wins.
  const burned = await redis.set(
    `goodagent:nonce:${deployId}:${auth.nonce}`,
    now,
    { nx: true, ex: Math.ceil((MAX_AGE_MS + MAX_FUTURE_MS) / 1000) },
  );
  if (burned === null) return "NONCE_REUSED";

  return null;
}

export function parseAuthBody(
  body: Record<string, unknown>,
): DeployControlAuth | null {
  const ownerWallet =
    typeof body.ownerWallet === "string" ? body.ownerWallet.trim() : "";
  const signature =
    typeof body.signature === "string" ? body.signature.trim() : "";
  const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
  const issuedAt =
    typeof body.issuedAt === "number"
      ? body.issuedAt
      : typeof body.issuedAt === "string"
        ? Number(body.issuedAt)
        : NaN;

  if (!ownerWallet || !signature || !nonce || !Number.isFinite(issuedAt)) {
    return null;
  }

  return {
    ownerWallet,
    signature: signature as `0x${string}`,
    issuedAt,
    nonce,
  };
}

const DEPLOY_ID_RE = /^[a-z0-9]{10,40}$/;

export function parseDeployId(raw: unknown): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return DEPLOY_ID_RE.test(trimmed) ? trimmed : null;
}

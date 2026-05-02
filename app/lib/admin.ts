import { NextRequest, NextResponse } from "next/server";
import { redis } from "./redis";

export const OPS_ALLOWLIST = [
  "0x0067378592a4d0ccc3146dba13137e21589921ed",
] as const;

export const OPS_SESSION_COOKIE = "ao_ops_session";
export const OPS_AUTH_TTL_SECONDS = 60 * 10;
export const OPS_SESSION_TTL_SECONDS = 60 * 60 * 12;

export function normalizeAdminAddress(address?: string | null): string | null {
  return address ? address.toLowerCase() : null;
}

export function isOpsAllowed(address?: string | null): boolean {
  const normalized = normalizeAdminAddress(address);
  if (!normalized) return false;
  return OPS_ALLOWLIST.includes(normalized as (typeof OPS_ALLOWLIST)[number]);
}

export function buildOpsAuthMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    "Action Order Ops Access",
    "",
    "Sign this message to unlock the internal ops dashboard.",
    `Address: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export const opsSessionKey = (token: string) => `ops-auth:session:${token}`;

export async function getOpsSessionAddress(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await redis.get<{ address: string }>(opsSessionKey(token));
  return isOpsAllowed(session?.address) ? normalizeAdminAddress(session?.address) : null;
}

export async function requireOpsSession(req: NextRequest): Promise<string | NextResponse> {
  const address = await getOpsSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return address;
}

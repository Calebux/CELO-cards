export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import {
  buildOpsAuthMessage,
  isOpsAllowed,
  normalizeAdminAddress,
  opsSessionKey,
  OPS_AUTH_TTL_SECONDS,
  OPS_SESSION_COOKIE,
  OPS_SESSION_TTL_SECONDS,
} from "../../../lib/admin";
import { redis } from "../../../lib/redis";

const nonceKey = (address: string) => `ops-auth:nonce:${address}`;

export async function GET(req: NextRequest) {
  const address = normalizeAdminAddress(req.nextUrl.searchParams.get("address"));
  if (!isOpsAllowed(address)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await redis.get<{ nonce: string; issuedAt: string }>(nonceKey(address!));
  if (existing) {
    return NextResponse.json(existing);
  }

  const payload = {
    nonce: randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  await redis.set(nonceKey(address!), payload, { ex: OPS_AUTH_TTL_SECONDS });
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, signature } = body as { address?: string; signature?: string };
  const normalized = normalizeAdminAddress(address);

  if (!isOpsAllowed(normalized)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Signature required" }, { status: 400 });
  }
  if (!signature.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const noncePayload = await redis.get<{ nonce: string; issuedAt: string }>(nonceKey(normalized!));
  if (!noncePayload) {
    return NextResponse.json({ error: "Auth request expired" }, { status: 410 });
  }

  const message = buildOpsAuthMessage(normalized!, noncePayload.nonce, noncePayload.issuedAt);

  let recovered: string;
  try {
    recovered = (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (recovered !== normalized) {
    return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
  }

  await redis.del(nonceKey(normalized!));

  const token = randomUUID();
  await redis.set(opsSessionKey(token), { address: normalized, createdAt: Date.now() }, { ex: OPS_SESSION_TTL_SECONDS });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: OPS_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPS_SESSION_TTL_SECONDS,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (token) {
    await redis.del(opsSessionKey(token)).catch(() => {});
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: OPS_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../lib/redis";
import { cardProgressNonceKey, CARD_PROGRESS_AUTH_TTL_SECONDS } from "../../../lib/cardProgressServer";

function isAddress(address: string | null | undefined): address is string {
  return !!address && /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const existing = await redis.get<{ nonce: string; issuedAt: string }>(cardProgressNonceKey(address));
  if (existing) {
    return NextResponse.json(existing);
  }

  const payload = {
    nonce: randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  await redis.set(cardProgressNonceKey(address), payload, { ex: CARD_PROGRESS_AUTH_TTL_SECONDS });
  return NextResponse.json(payload);
}

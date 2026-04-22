export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../lib/redis";

const CREDIT_TTL = 60 * 60 * 24; // 24 hours in seconds

function creditKey(address: string) {
  return `ranked:credit:${address.toLowerCase()}`;
}

// GET ?address=0x... — check if a ranked fee credit exists
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ hasCredit: false });
  }
  const ttl = await redis.ttl(creditKey(address));
  const hasCredit = ttl > 0;
  return NextResponse.json({ hasCredit, expiresInSeconds: hasCredit ? ttl : 0 });
}

// POST — store a new credit for this address (called after payment)
export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json() as { address: string };
    address = (body.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
  }
  await redis.set(creditKey(address), "1", { ex: CREDIT_TTL });
  return NextResponse.json({ ok: true });
}

// DELETE ?address=0x... — consume (remove) the credit when match is found
export async function DELETE(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  await redis.del(creditKey(address));
  return NextResponse.json({ ok: true });
}

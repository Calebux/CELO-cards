export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { CARDS } from "../../lib/gameData";
import { verifyCardProgressSignature } from "../../lib/cardProgress";
import { redis } from "../../lib/redis";
import {
  cardProgressNonceKey,
  getCardProgress,
  sanitizeCardProgressPayload,
  updateSignatureCardProgress,
} from "../../lib/cardProgressServer";

const VALID_CARD_IDS = new Set(CARDS.map((card) => card.id));

function isAddress(address: string | null | undefined): address is string {
  return !!address && /^0x[0-9a-fA-F]{40}$/.test(address);
}

function normalizeSignatureCardId(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" && VALID_CARD_IDS.has(value) ? value : null;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const existing = sanitizeCardProgressPayload(await getCardProgress(address));
  return NextResponse.json({ ok: true, ...existing });
}

export async function POST(req: NextRequest) {
  let body: { address?: string; signatureCardId?: string | null; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isAddress(body.address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!body.signature || !body.signature.startsWith("0x")) {
    return NextResponse.json({ error: "Valid signature required" }, { status: 400 });
  }

  const signatureCardId = normalizeSignatureCardId(body.signatureCardId);
  if (body.signatureCardId != null && signatureCardId == null) {
    return NextResponse.json({ error: "Invalid signature card" }, { status: 400 });
  }

  const noncePayload = await redis.get<{ nonce: string; issuedAt: string }>(cardProgressNonceKey(body.address));
  if (!noncePayload) {
    return NextResponse.json({ error: "Auth request expired" }, { status: 410 });
  }

  const verified = await verifyCardProgressSignature(
    body.address,
    signatureCardId,
    noncePayload.nonce,
    noncePayload.issuedAt,
    body.signature
  );
  if (!verified) {
    return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
  }

  await redis.del(cardProgressNonceKey(body.address)).catch(() => {});
  const snapshot = await updateSignatureCardProgress(body.address, signatureCardId);
  return NextResponse.json({ ok: true, snapshot });
}

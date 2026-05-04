export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { CARDS } from "../../lib/gameData";
import { ATTUNEMENT_LIMIT } from "../../lib/cardProgress";
import { verifyCardProgressSignature } from "../../lib/cardProgress";
import { redis } from "../../lib/redis";
import {
  cardProgressNonceKey,
  getCardProgress,
  sanitizeCardProgressPayload,
  updateAttunedCardProgress,
} from "../../lib/cardProgressServer";

const VALID_CARD_IDS = new Set(CARDS.map((card) => card.id));

function isAddress(address: string | null | undefined): address is string {
  return !!address && /^0x[0-9a-fA-F]{40}$/.test(address);
}

function normalizeAttunedCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const cardId of value) {
    if (typeof cardId !== "string" || !VALID_CARD_IDS.has(cardId) || seen.has(cardId)) continue;
    seen.add(cardId);
    next.push(cardId);
    if (next.length > ATTUNEMENT_LIMIT) return null;
  }
  return next;
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
  let body: { address?: string; attunedCardIds?: string[]; signature?: string };
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

  const attunedCardIds = normalizeAttunedCardIds(body.attunedCardIds);
  if (!attunedCardIds) {
    return NextResponse.json({ error: `Attune up to ${ATTUNEMENT_LIMIT} valid cards` }, { status: 400 });
  }

  const noncePayload = await redis.get<{ nonce: string; issuedAt: string }>(cardProgressNonceKey(body.address));
  if (!noncePayload) {
    return NextResponse.json({ error: "Auth request expired" }, { status: 410 });
  }

  const verified = await verifyCardProgressSignature(
    body.address,
    attunedCardIds,
    noncePayload.nonce,
    noncePayload.issuedAt,
    body.signature
  );
  if (!verified) {
    return NextResponse.json({ error: "Wallet signature does not match attunement update" }, { status: 401 });
  }

  await redis.del(cardProgressNonceKey(body.address)).catch(() => {});
  const snapshot = await updateAttunedCardProgress(body.address, attunedCardIds);
  return NextResponse.json({ ok: true, snapshot });
}

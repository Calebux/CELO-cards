import { NextRequest, NextResponse } from "next/server";
import { CARDS } from "../../../lib/gameData";
import { recordBlackMarketPurchaseActivity } from "../../../lib/opsActivity";
import { sanitizePlayerName } from "../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    address?: string;
    playerName?: string | null;
    cardId?: string;
    currency?: "celo" | "gdollar" | "usdt";
    pricePoints?: number;
    txHash?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!body.cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  const card = CARDS.find((item) => item.id === body.cardId);
  if (!card) {
    return NextResponse.json({ error: "Unknown card" }, { status: 400 });
  }
  if (body.currency !== "celo" && body.currency !== "gdollar" && body.currency !== "usdt") {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }
  if (typeof body.pricePoints !== "number" || body.pricePoints <= 0) {
    return NextResponse.json({ error: "Invalid pricePoints" }, { status: 400 });
  }
  if (!body.txHash || typeof body.txHash !== "string") {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  await recordBlackMarketPurchaseActivity({
    address,
    playerName: sanitizePlayerName(body.playerName),
    cardId: card.id,
    cardName: card.name,
    currency: body.currency,
    pricePoints: body.pricePoints,
    txHash: body.txHash,
    purchasedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createTradeOffer, getTradeOffer, updateTradeStatus, getInbox, getOutbox } from "../../lib/cardTrade";
import { checkRateLimit } from "../../lib/rateLimit";

export const dynamic = "force-dynamic";

const PENDING_GRANTS_TTL = 60 * 60 * 24 * 30; // 30 days

// GET /api/trade?address=0x...&view=inbox|outbox|grants
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const view = req.nextUrl.searchParams.get("view") ?? "inbox";

  if (view === "grants") {
    const grants = await redis.lrange<string>(`trade-grants:${address}`, 0, -1);
    return NextResponse.json({ grants });
  }

  const offers = view === "outbox" ? await getOutbox(address) : await getInbox(address);
  return NextResponse.json({ offers });
}

// POST /api/trade — create a new trade offer
// Body: { fromAddress, toAddress, offeredCardId, requestedCardId? }
export async function POST(req: NextRequest) {
  let body: { fromAddress?: string; toAddress?: string; offeredCardId?: string; requestedCardId?: string | null };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromAddress = body.fromAddress?.toLowerCase();
  const toAddress = body.toAddress?.toLowerCase();
  const { offeredCardId, requestedCardId = null } = body;

  if (!fromAddress || !/^0x[0-9a-f]{40}$/.test(fromAddress)) {
    return NextResponse.json({ error: "Invalid sender address" }, { status: 400 });
  }
  if (!toAddress || !/^0x[0-9a-f]{40}$/.test(toAddress)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }
  if (!offeredCardId || typeof offeredCardId !== "string") {
    return NextResponse.json({ error: "offeredCardId is required" }, { status: 400 });
  }
  if (fromAddress === toAddress) {
    return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:trade:${fromAddress}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const offer = await createTradeOffer(fromAddress, toAddress, offeredCardId, requestedCardId ?? null);
  return NextResponse.json({ ok: true, offer });
}

// PATCH /api/trade — accept, decline, or cancel an offer
// Body: { tradeId, action: 'accept'|'decline'|'cancel', address }
export async function PATCH(req: NextRequest) {
  let body: { tradeId?: string; action?: string; address?: string };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tradeId, action, address } = body;
  if (!tradeId || !action || !address) {
    return NextResponse.json({ error: "tradeId, action, and address are required" }, { status: 400 });
  }

  const addr = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:trade-action:${addr}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const offer = await getTradeOffer(tradeId);
  if (!offer) return NextResponse.json({ error: "Trade offer not found" }, { status: 404 });
  if (offer.status !== "pending") return NextResponse.json({ error: "Offer is no longer pending" }, { status: 409 });

  if (action === "cancel") {
    if (offer.fromAddress !== addr) return NextResponse.json({ error: "Only the sender can cancel" }, { status: 403 });
    const updated = await updateTradeStatus(tradeId, "cancelled");
    return NextResponse.json({ ok: true, offer: updated });
  }

  if (action === "decline") {
    if (offer.toAddress !== addr) return NextResponse.json({ error: "Only the recipient can decline" }, { status: 403 });
    const updated = await updateTradeStatus(tradeId, "declined");
    return NextResponse.json({ ok: true, offer: updated });
  }

  if (action === "accept") {
    if (offer.toAddress !== addr) return NextResponse.json({ error: "Only the recipient can accept" }, { status: 403 });

    const updated = await updateTradeStatus(tradeId, "accepted");

    // Grant offered card to recipient
    await redis.lpush(`trade-grants:${addr}`, offer.offeredCardId);
    await redis.expire(`trade-grants:${addr}`, PENDING_GRANTS_TTL);

    // If it's a swap, grant requested card back to sender
    if (offer.requestedCardId) {
      await redis.lpush(`trade-grants:${offer.fromAddress}`, offer.requestedCardId);
      await redis.expire(`trade-grants:${offer.fromAddress}`, PENDING_GRANTS_TTL);
    }

    return NextResponse.json({ ok: true, offer: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
